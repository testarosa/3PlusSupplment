using System.Net;
using System.Net.NetworkInformation;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Server.IIS;
using Microsoft.AspNetCore.WebUtilities;

var builder = WebApplication.CreateBuilder(args);
var serviceDirectory = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
builder.Configuration.AddJsonFile(Path.Combine(serviceDirectory, "3PlusPortalGateway", "azure.json"), optional: true);
var portalOrigin = new Uri(builder.Configuration["Portal:Origin"] ?? "https://e3pl.com");
var backend = new Uri(builder.Configuration["Portal:Backend"] ?? "http://192.168.20.8/");
var upstreamHost = builder.Configuration["Portal:BackendHost"] ?? "api.e3pl.com";
if (portalOrigin.Scheme != "https" || !IPAddress.TryParse(backend.Host, out var localAddress) ||
    !(IPAddress.IsLoopback(localAddress) || NetworkInterface.GetAllNetworkInterfaces()
        .SelectMany(network => network.GetIPProperties().UnicastAddresses)
        .Any(address => address.Address.Equals(localAddress))))
    throw new InvalidOperationException("Use an HTTPS portal origin and a backend on the same host.");

const int MaxApiBody = 2 * 1024 * 1024;
var profileFields = new HashSet<string>(["userId", "id", "userName", "name", "f_UserName",
    "branch", "branchCode", "branchId", "branchName", "fBranch", "f_Branch"], StringComparer.OrdinalIgnoreCase);
builder.Services.Configure<IISServerOptions>(options => options.MaxRequestBodySize = MaxApiBody);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = MaxApiBody);
// The legacy sign-in endpoint takes its credentials in the upstream URL.
builder.Logging.AddFilter("System.Net.Http.HttpClient", LogLevel.None);
builder.Services.AddHttpClient("billing", client => client.Timeout = TimeSpan.FromSeconds(25))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false, UseProxy = false });
builder.Services.AddHttpClient("azure-extraction", client => client.Timeout = TimeSpan.FromSeconds(90))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false });
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "__Secure-3PlusSession";
    options.Cookie.Path = "/portal-api";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = false;
    options.Events.OnRedirectToLogin = context =>
        Results.Json(new { message = "Sign in to continue." }, statusCode: StatusCodes.Status401Unauthorized).ExecuteAsync(context.HttpContext);
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("sign-in", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy("extraction", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier)?.ToUpperInvariant() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 6, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();
app.Use(async (context, next) =>
{
    var request = context.Request;
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers.XContentTypeOptions = "nosniff";
    if (!request.IsHttps || !StringComparer.OrdinalIgnoreCase.Equals(request.Host.Value, portalOrigin.Authority))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    if (!HttpMethods.IsGet(request.Method) && request.Headers.Origin != portalOrigin.GetLeftPart(UriPartial.Authority))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }
    try { await next(context); }
    catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException)
    {
        if (context.Response.HasStarted) context.Abort();
        else if (!context.RequestAborted.IsCancellationRequested)
            await Results.Json(new { message = "The billing service did not respond. Try again." }, statusCode: StatusCodes.Status502BadGateway).ExecuteAsync(context);
    }
});
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapPost("/session/login", async (Credentials credentials, HttpContext context, IHttpClientFactory clients) =>
{
    if (string.IsNullOrWhiteSpace(credentials.Username) || credentials.Username.Length > 128 ||
        string.IsNullOrEmpty(credentials.Password) || credentials.Password.Length > 256)
        return Results.BadRequest(new { message = "Enter a valid username and password." });

    var path = QueryHelpers.AddQueryString("/Auth/Login", new Dictionary<string, string?>
    { ["userId"] = credentials.Username, ["password"] = credentials.Password });
    using var request = CreateRequest(HttpMethod.Post, path);
    request.Content = new ByteArrayContent([]);
    using var response = await clients.CreateClient("billing").SendAsync(request, context.RequestAborted);
    if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        return Results.Json(new { message = "Username or password was not accepted." }, statusCode: 401);
    if (!response.IsSuccessStatusCode)
        return Results.Json(new { message = "The billing sign-in service is unavailable." }, statusCode: 502);

    using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(context.RequestAborted));
    var result = document.RootElement;
    if (result.ValueKind != JsonValueKind.Object || !result.TryGetProperty("success", out var success) ||
        success.ValueKind != JsonValueKind.True || !result.TryGetProperty("data", out var account) ||
        account.ValueKind != JsonValueKind.Object)
        return Results.Json(new { message = "Username or password was not accepted." }, statusCode: 401);

    var profile = account.EnumerateObject().Where(field => profileFields.Contains(field.Name) &&
        field.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number)
        .ToDictionary(field => field.Name, field => (object)field.Value.Clone(), StringComparer.Ordinal);
    if (!profile.Keys.Any(field => field.Equals("userid", StringComparison.OrdinalIgnoreCase) || field.Equals("id", StringComparison.OrdinalIgnoreCase)))
        profile["userId"] = credentials.Username;
    await context.SignInAsync(new ClaimsPrincipal(new ClaimsIdentity(
        [new Claim(ClaimTypes.NameIdentifier, credentials.Username)], CookieAuthenticationDefaults.AuthenticationScheme)));
    return Results.Ok(new { success = true, data = profile });
}).RequireRateLimiting("sign-in");

app.MapPost("/session/logout", async (HttpContext context) =>
{
    await context.SignOutAsync();
    return Results.NoContent();
});

var routes = new (string Method, string Path)[]
{
    ("GET", "/AgentCompany/SearchByName"), ("GET", "/BillingCode/GetBillingCode"),
    ("GET", "/Customer/GetCustomers"), ("GET", "/api/FreightType"),
    ("GET", "/Invoice/GetInvoice/{reference}"), ("GET", "/Invoice/GetInvoiceByInvoiceId/{id}"),
    ("GET", "/Invoice/SearchInvoices"), ("POST", "/Invoice/SaveInvoice"),
    ("DELETE", "/Invoice/DeleteInvoice/{id}"), ("DELETE", "/Invoice/DeleteInvoice"), ("POST", "/Invoice/DeleteInvoice"),
    ("GET", "/Crdr/GetCrdrs"), ("GET", "/Crdr/GetCrdrById/{id}"),
    ("GET", "/Crdr/GetCRDRByRefNumber"), ("POST", "/Crdr/SaveCrdr"),
    ("GET", "/CrdrTemplate/GetTemplate"), ("GET", "/CrdrTemplate/GetByAgentName"),
    ("GET", "/CrdrTemplate/GetByAgentId"), ("POST", "/CrdrTemplate/Insert"),
    ("POST", "/CrdrTemplate/Update"), ("DELETE", "/CrdrTemplate/Delete/{id}"),
    ("GET", "/api/InvoiceTemplates"), ("GET", "/api/InvoiceTemplates/by-customer"),
    ("GET", "/api/InvoiceTemplates/{id}"), ("POST", "/api/InvoiceTemplates"),
    ("PUT", "/api/InvoiceTemplates/{id}"), ("DELETE", "/api/InvoiceTemplates/{id}")
};
foreach (var (method, path) in routes)
    app.MapMethods(path, [method], ProxyBilling).RequireAuthorization();

CrdrExtraction.Map(app);

app.Run();

HttpRequestMessage CreateRequest(HttpMethod method, string pathAndQuery)
{
    var request = new HttpRequestMessage(method, new Uri(backend, pathAndQuery));
    request.Headers.Host = upstreamHost;
    request.Headers.Accept.ParseAdd("application/json, text/plain");
    return request;
}

async Task ProxyBilling(HttpContext context, IHttpClientFactory clients)
{
    var incoming = context.Request;
    if (incoming.RouteValues.Values.OfType<string>().Any(value => value is "." or ".." || value.IndexOfAny(['/', '\\', '%']) >= 0))
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }
    using var request = CreateRequest(new HttpMethod(incoming.Method), incoming.Path.ToUriComponent() + incoming.QueryString.ToUriComponent());
    if (HttpMethods.IsPost(incoming.Method) || HttpMethods.IsPut(incoming.Method))
    {
        if (!incoming.HasJsonContentType())
        {
            context.Response.StatusCode = StatusCodes.Status415UnsupportedMediaType;
            return;
        }
        request.Content = new StreamContent(incoming.Body);
        request.Content.Headers.ContentType = new("application/json");
    }

    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
    timeout.CancelAfter(TimeSpan.FromSeconds(25));
    using var upstream = await clients.CreateClient("billing").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
    var mediaType = upstream.Content.Headers.ContentType?.MediaType;
    if ((int)upstream.StatusCode is >= 300 and < 400 || mediaType is not (null or "application/json" or "text/plain" or "application/problem+json"))
    {
        await Results.Json(new { message = "Unexpected response from the billing service." }, statusCode: StatusCodes.Status502BadGateway).ExecuteAsync(context);
        return;
    }
    context.Response.StatusCode = (int)upstream.StatusCode;
    if (upstream.Content.Headers.ContentType is { } contentType) context.Response.ContentType = contentType.ToString();
    await upstream.Content.CopyToAsync(context.Response.Body, timeout.Token);
}

record Credentials(string? Username, string? Password);
