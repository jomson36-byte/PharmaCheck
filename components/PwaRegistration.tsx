"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => false);
    }
  }, []);

  return null;
}
