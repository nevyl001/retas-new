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
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          icon: "✅",
        };
      case "error":
        return {
          background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
          icon: "⚠️",
        };
      case "info":
        return {
          background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
          icon: "ℹ️",
        };
      default:
        return {
          background: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
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
