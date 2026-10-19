"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { writeStored } from "@/lib/storage";
import { THEME_EVENT, THEME_KEY, applyTheme, currentTheme, type Theme } from "@/lib/theme";

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, currentTheme, () => "day");
  const next: Theme = theme === "day" ? "night" : "day";
  const label = `Switch to ${next} theme`;
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => {
        applyTheme(next);
        writeStored(THEME_KEY, next);
      }}
    >
      {theme === "day" ? <Sun /> : <Moon />}
    </Button>
  );
}
