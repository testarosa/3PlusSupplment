import React from "react";

function Header({ displayName = "User", onLogout }) {
  const handleLogout = () => {
    if (typeof onLogout === "function") onLogout();
  };

  return (
    <header className="dashboard-header">
      <div className="header-inner">
        <div className="brand-area">
          <h1>3Plus Forwarding System</h1>
          <div className="welcome">Welcome, {displayName}</div>
        </div>
        <div className="header-controls">
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
