import React from "react";
import { IconShield, IconLogout, IconUser } from "../icons/Icons";
import { Button } from "../common/Button";

export function Header({ user, onLogout }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <div className="logo-icon">
            <IconShield size={20} />
          </div>
          <span className="logo-text">
            Lex<span>Secure</span>
          </span>
        </div>

        {user && (
          <div className="user-info">
            <div className="user-badge">
              <div className="user-avatar">
                {user.username?.charAt(0) || "?"}
              </div>
              <div>
                <div className="user-name">{user.username}</div>
                <div className="user-role">{user.role}</div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onLogout} title="Cerrar sesión">
              <IconLogout size={18} />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
