"use client";

import { useEffect } from "react";
import { wakeupServer } from "@/lib/api";

export default function KeepAlive() {
  useEffect(() => {
    // Initial wakeup trigger when page loads
    wakeupServer();

    // Loop every 14 minutes to keep the Render backend warm
    const interval = setInterval(() => {
      console.log("Keep-alive: Waking up Render backend service...");
      wakeupServer();
    }, 14 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
