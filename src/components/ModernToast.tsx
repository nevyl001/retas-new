import React, { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export const ModernToast: React.FC<ToastProps> = ({
  message,
  type,
  isVisible,
  onClose,
  duration = 3000,
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setTimeout(onClose, 300); // Esperar a que termine la animación
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  const getToastStyles = () => {
    switch (type) {
      case "success":
        return {
          background: "#E8DCC8",
          color: "#111111",
          icon: "🎉",
        };
      case "error":
        return {
          background: "#B91C1C",
          color: "#F5F5F0",
          icon: "⚠️",
        };
      case "info":
        return {
          background: "#1E3A5F",
          color: "#F5F5F0",
          icon: "ℹ️",
        };
      default:
        return {
          background: "#3A3A3A",
          color: "#F5F5F0",
          icon: "💬",
        };
    }
  };

  const styles = getToastStyles();

  return (
    <div
      className={`modern-toast ${
        isAnimating ? "toast-visible" : "toast-hidden"
      }`}
      style={{
        background: styles.background,
        color: styles.color,
      }}
    >
      <div className="modern-toast-content">
        <span className="modern-toast-icon">{styles.icon}</span>
        <span className="modern-toast-message">{message}</span>
      </div>
      <button className="modern-toast-close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
};
