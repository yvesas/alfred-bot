import { describe, it, expect, beforeEach } from "vitest";
import { getTheme, setTheme, toggleTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("setTheme toggles the dark class and persists the choice", () => {
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("alfred_theme")).toBe("dark");

    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("alfred_theme")).toBe("light");
  });

  it("toggleTheme flips and returns the new theme", () => {
    setTheme("light");
    expect(toggleTheme()).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(toggleTheme()).toBe("light");
    expect(getTheme()).toBe("light");
  });
});
