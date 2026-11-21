using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.Features;

static class CrdrExtraction
{
    private const int MaxBytes = 10 * 1024 * 1024;
    private static readonly SemaphoreSlim ActiveRequests = new(2);
    private static readonly Dictionary<string, byte[]> Signatures = new(StringComparer.OrdinalIgnoreCase)
    {
        ["application/pdf"] = "%PDF-"u8.ToArray(),
        ["image/png"] = Convert.FromHexString("89504E470D0A1A0A"),
        ["image/jpeg"] = Convert.FromHexString("FFD8FF")
    };

    public static void Map(WebApplication app)
    {
        using var contractStream = typeof(CrdrExtraction).Assembly.GetManifestResourceStream("CrdrExtractionContract")
            ?? throw new InvalidOperationException("The CRDR extraction contract is missing.");
        using var contract = JsonDocument.Parse(contractStream);
        var instructions = contract.RootElement.GetProperty("instructions").GetString();
        var schema = contract.RootElement.GetProperty("schema").Clone();
        var key = app.Configuration["AzureExtraction:ApiKey"]?.Trim();
        var deployment = app.Configuration["AzureExtraction:Deployment"]?.Trim();
        var endpoint = app.Configuration["AzureExtraction:Endpoint"]?.Trim() ?? "";
        var configured = !string.IsNullOrEmpty(key) && !string.IsNullOrEmpty(deployment) &&
            Regex.IsMatch(endpoint, @"\Ahttps://[a-z0-9-]+\.(?:openai\.azure\.com|services\.ai\.azure\.com)/?\z", RegexOptions.IgnoreCase);

        app.MapPost("/crdr-ai/extract", async (HttpContext context, IHttpClientFactory clients) =>
        {
            if (!configured) return Error(503, "Azure AI extraction is not configured on this server.");
            var request = context.Request;
            var mime = request.ContentType?.ToLowerInvariant() ?? "";
            if (!Signatures.TryGetValue(mime, out var signature)) return Error(415, "Choose a PDF, PNG, or JPEG file.");
            if (request.ContentLength > MaxBytes) return Error(413, "The note must be 10 MB or smaller.");
            if (!ActiveRequests.Wait(0)) return Error(429, "Extraction is busy. Try again shortly.");

            try
            {
                if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
                    limit.MaxRequestBodySize = MaxBytes;

                using var file = new MemoryStream((int)(request.ContentLength ?? 0));
                var buffer = new byte[64 * 1024];
                int read;
                while ((read = await request.Body.ReadAsync(buffer, context.RequestAborted)) > 0)
                {
                    if (file.Length + read > MaxBytes) return Error(413, "The note must be 10 MB or smaller.");
                    file.Write(buffer, 0, read);
                }
                if (!file.GetBuffer().AsSpan(0, (int)file.Length).StartsWith(signature))
                    return Error(415, "The file content does not match its type.");

                var dataUrl = $"data:{mime};base64,{Convert.ToBase64String(file.GetBuffer(), 0, (int)file.Length)}";
                object document = mime == "application/pdf"
                    ? new { type = "input_file", filename = "credit-debit-note.pdf", file_data = dataUrl }
                    : new { type = "input_image", image_url = dataUrl, detail = "high" };
                using var azureRequest = new HttpRequestMessage(HttpMethod.Post, endpoint.TrimEnd('/') + "/openai/v1/responses");
                azureRequest.Headers.Add("api-key", key!);
                azureRequest.Content = JsonContent.Create(new
                {
                    model = deployment, store = false, instructions,
                    input = new[] { new { role = "user", content = new[] { document } } },
                    text = new { format = new { type = "json_schema", name = "credit_debit_note", strict = true, schema } },
                    max_output_tokens = 5000
                });

                using var response = await clients.CreateClient("azure-extraction").SendAsync(azureRequest, context.RequestAborted);
                if (response.StatusCode == HttpStatusCode.TooManyRequests) return Error(429, "Azure AI is busy. Try again shortly.");
                if (!response.IsSuccessStatusCode) return Error(502, "Azure AI could not process the note. Try again or enter charges manually.");
                var result = await response.Content.ReadFromJsonAsync<AzureResult>(cancellationToken: context.RequestAborted);
                var output = result?.Status == "completed" ? result.Output?
                    .Where(item => item.Type == "message").SelectMany(item => item.Content ?? [])
                    .FirstOrDefault(part => part.Type == "output_text")?.Text : null;
                if (string.IsNullOrWhiteSpace(output)) return Error(422, "Azure AI did not return a complete extraction.");

                var draft = JsonSerializer.Deserialize<Draft>(output, JsonSerializerOptions.Web);
                if (draft?.NoteType is not ("credit" or "debit" or "mixed") || draft.Lines is not { Length: > 0 } ||
                    draft.Lines.Any(line => line is null || string.IsNullOrWhiteSpace(line.Description) ||
                        line.Debit is null or < 0 || line.Credit is null or < 0 || (line.Debit == 0 && line.Credit == 0)))
                    return Error(422, "No reliable charge lines were found. Check the note or enter it manually.");
                return Results.Ok(draft);
            }
            catch (BadHttpRequestException error) when (error.StatusCode == 413)
            {
                return Error(413, "The note must be 10 MB or smaller.");
            }
            catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested)
            {
                return Error(504, "Azure AI timed out. Try again or enter charges manually.");
            }
            catch (Exception error) when (error is HttpRequestException or JsonException)
            {
                return Error(502, "Extraction failed. Try again or enter charges manually.");
            }
            finally { ActiveRequests.Release(); }
        }).RequireAuthorization().RequireRateLimiting("extraction");
    }

    private static IResult Error(int statusCode, string message) => Results.Json(new { message }, statusCode: statusCode);

    private sealed record AzureResult(string? Status, AzureItem[]? Output);
    private sealed record AzureItem(string? Type, AzurePart[]? Content);
    private sealed record AzurePart(string? Type, string? Text);
    private sealed record Draft(string? NoteType, string? NoteNumber, string? ReferenceNumber, string? HblNumber,
        string? AgentName, string? Currency, string? InvoiceDate, string? DueDate, Charge?[]? Lines);
    private sealed record Charge(string? Description, decimal? Debit, decimal? Credit);
}
