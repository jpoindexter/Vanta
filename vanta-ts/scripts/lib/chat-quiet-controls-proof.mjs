import assert from "node:assert/strict";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

async function appearance(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    const rgba = (value) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    return {
      background: rgba(style.backgroundColor),
      borders: ["Top", "Right", "Bottom", "Left"].map((side) => ({
        width: Number.parseFloat(style[`border${side}Width`]),
        color: rgba(style[`border${side}Color`]),
      })),
      outline: { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle, color: rgba(style.outlineColor) },
      shadow: style.boxShadow, focused: element.matches(":focus-visible"),
      image: style.backgroundImage, imageSize: style.backgroundSize,
      imageRepeat: style.backgroundRepeat, caret: rgba(style.caretColor),
    };
  });
}

function luminance(color) {
  const linear = color.slice(0, 3).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground, background) {
  const alpha = foreground[3] / 255;
  const blended = foreground.map((value, index) => value * alpha + background[index] * (1 - alpha));
  const pair = [luminance(blended), luminance(background)].sort((a, b) => a - b);
  return (pair[1] + 0.05) / (pair[0] + 0.05);
}

function borderless(state, label) {
  assert(state.borders.every((border) => border.width === 0 || border.color[3] === 0), `${label} has a visible resting outline: ${JSON.stringify(state.borders)}`);
}

function quietSurface(state, label) {
  const maximum = luminance(state.background) > 0.5 ? 1.5 : 1.8;
  for (const border of state.borders) {
    assert(border.width <= 1, `${label} edge exceeds one CSS pixel`);
    assert(contrast(border.color, state.background) <= maximum, `${label} edge is too strong: ${JSON.stringify(border)}`);
  }
}

async function composerFocusCue(page, input, theme) {
  const focus = await appearance(input);
  const surface = await appearance(page.locator("form.composer"));
  assert(focus.focused, `${theme} textarea lost its focus-visible state`);
  assert.match(focus.image, /linear-gradient\(/, `${theme} textarea has no visible focus cue`);
  assert.equal(focus.imageSize, "24px 2px", `${theme} focus cue must stay short, not frame the input`);
  assert.equal(focus.imageRepeat, "no-repeat", `${theme} focus cue repeats across the input`);
  assert(contrast(focus.caret, surface.background) >= 3, `${theme} text caret contrast is below 3:1`);
}

async function composerStates(ctx, theme) {
  const { page, capture } = ctx;
  const input = page.locator("#vanta-composer");
  await page.locator(".chat-starters button").first().click({ trial: true });
  await page.locator(".chat-starters button").first().focus();
  const resting = await appearance(page.locator("form.composer"));
  await input.click();
  await input.fill("An editable draft, never submitted by this visual proof.");
  await capture(`quiet-controls-${theme}-composer-focus`);
  const focused = await appearance(page.locator("form.composer"));
  assert.deepEqual(focused.borders, resting.borders, `${theme} composer focus darkens its resting boundary`);
  quietSurface(focused, `${theme} focused composer`);
  await composerFocusCue(page, input, theme);
  assert.equal(await input.inputValue(), "An editable draft, never submitted by this visual proof.");
  assert.equal(await page.getByRole("button", { name: "Send", exact: true }).isEnabled(), true);
  await input.fill("");
  assert.equal(await page.getByRole("button", { name: "Send", exact: true }).isDisabled(), true);
}

async function starterStates(ctx, theme) {
  const { page, capture } = ctx;
  const starters = page.locator(".chat-starters button");
  assert.equal(await starters.count(), 3);
  await page.mouse.move(0, 0);
  for (const button of await starters.all()) borderless(await appearance(button), `${theme} starter`);
  const before = await appearance(starters.first());
  await starters.first().hover();
  const hovered = await appearance(starters.first());
  assert.notDeepEqual(hovered.background, before.background, `${theme} starter has no hover feedback`);
  await capture(`quiet-controls-${theme}-starter-hover`);
  await starters.first().focus(); await page.keyboard.press("Tab");
  const keyboard = await appearance(starters.nth(1));
  assert(keyboard.focused, "Tab did not reach the next starter");
  assert(keyboard.outline.width >= 2 && keyboard.outline.style !== "none", "keyboard focus is not visibly outlined");
  const surface = await appearance(page.locator(".chat-main-column"));
  assert(contrast(keyboard.outline.color, surface.background) >= 3, "keyboard focus contrast is below 3:1");
  await capture(`quiet-controls-${theme}-keyboard-focus`);
}

const menus = [
  { trigger: ".model-button", surface: ".model-settings-popover", rows: ".model-settings-row", name: "model" },
  { trigger: ".approval-mode", surface: ".access-mode-menu", rows: "fieldset label", name: "access" },
  { trigger: ".chat-window-options > summary", surface: ".chat-window-menu", rows: ":scope > button, :scope > a", name: "workspace" },
  { trigger: ".chat-tools-toggle", surface: ".chat-feature-nav", rows: ":scope > button", name: "tools" },
  { trigger: '[aria-label="Capture screen context"]', surface: ".look-capture-menu", rows: ":scope > button", name: "capture" },
];

async function historyIsInert(trigger) {
  return trigger.evaluate((element) => element.closest(".lc-sidebar")?.querySelector(".lc-history-panel")?.inert);
}

async function toolsDismissal(page, trigger, surface) {
  assert.equal(await historyIsInert(trigger), false, "Escape did not restore history interaction");
  await trigger.click();
  await surface.waitFor({ state: "visible" });
  assert.equal(await historyIsInert(trigger), true, "reopened tools leave obscured history interactive");
  await page.locator("#vanta-composer").click();
  await surface.waitFor({ state: "hidden" });
  assert.equal(await historyIsInert(trigger), false, "outside click did not restore history interaction");
}

async function modelAnchored(page, trigger, surface) {
  await inWindow(page, surface, "model menu");
  const target = await trigger.boundingBox();
  const menu = await surface.boundingBox();
  assert(target && menu, "model trigger or popup disappeared");
  const verticalGaps = [target.y - menu.y - menu.height, menu.y - target.y - target.height];
  assert(verticalGaps.some((gap) => gap >= -1 && gap <= 16), `model menu is detached from its trigger: ${verticalGaps}`);
  assert(menu.x < target.x + target.width && menu.x + menu.width > target.x, "model popup is horizontally detached from its trigger");
}

async function menuStates(ctx, theme) {
  const { page, capture } = ctx;
  for (const menu of menus) {
    const trigger = page.locator(menu.trigger);
    await trigger.click();
    const surface = page.locator(menu.surface);
    await surface.waitFor({ state: "visible" });
    if (menu.name === "model") await modelAnchored(page, trigger, surface);
    if (menu.name === "tools") assert.equal(await historyIsInert(trigger), true, "tools popup leaves obscured history interactive");
    await capture(`quiet-controls-${theme}-${menu.name}-menu`);
    quietSurface(await appearance(surface), `${theme} ${menu.name} menu`);
    const rows = surface.locator(menu.rows);
    assert(await rows.count() > 0, `${menu.name} menu has no options`);
    for (const row of await rows.all()) borderless(await appearance(row), `${theme} ${menu.name} option`);
    await scanAccessibility(page, `${theme} quiet ${menu.name} menu`);
    await page.keyboard.press("Escape");
    await surface.waitFor({ state: "hidden" });
    if (menu.name === "tools") await toolsDismissal(page, trigger, surface);
  }
}

async function inWindow(page, locator, label) {
  const bounds = await locator.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert(bounds && bounds.x >= -1 && bounds.y >= -1, `${label} starts outside viewport`);
  assert(bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `${label} extends outside viewport`);
}

async function narrowStates(ctx, theme) {
  const { page, app, capture } = ctx;
  const window = await app.browserWindow(page);
  await window.evaluate((win) => win.setContentSize(760, 900));
  await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
  await inWindow(page, page.locator("form.composer"), `${theme} narrow composer`);
  for (const button of await page.locator(".chat-starters button").all()) await inWindow(page, button, `${theme} narrow starter`);
  for (const menu of menus.slice(0, 3)) {
    await page.locator(menu.trigger).click();
    await inWindow(page, page.locator(menu.surface), `${theme} narrow ${menu.name} menu`);
    if (menu.name === "model") await modelAnchored(page, page.locator(menu.trigger), page.locator(menu.surface));
    await page.keyboard.press("Escape");
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "quiet controls introduced horizontal overflow");
  await capture(`quiet-controls-${theme}-760`);
  await scanAccessibility(page, `${theme} narrow quiet controls`);
  await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  await window.evaluate((win) => win.setContentSize(1440, 900));
}

async function appearanceSettings(ctx, theme) {
  const { page, capture } = ctx;
  await page.locator(".chat-sidebar").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.waitFor();
  for (const selector of [".dialog-heading", ".settings-content"]) {
    const padding = await dialog.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(Number.parseFloat);
    });
    assert(padding.every((value) => value >= 16), `${theme} ${selector} lost its dialog inset: ${padding}`);
  }
  for (const button of await dialog.getByRole("group", { name: "Desktop theme" }).getByRole("button").all()) {
    const bounds = await button.boundingBox();
    assert(bounds.height >= 24 && bounds.height <= 44, `${theme} theme control is vertically stretched: ${bounds.height}`);
  }
  await capture(`quiet-controls-${theme}-appearance-settings`);
  await scanAccessibility(page, `${theme} Appearance settings`);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

async function forcedColorStates(ctx) {
  const { page, capture } = ctx;
  await page.emulateMedia({ forcedColors: "active" });
  try {
    assert(await page.evaluate(() => matchMedia("(forced-colors: active)").matches));
    const input = page.locator("#vanta-composer");
    await input.focus(); await input.fill("Unsent high-contrast focus proof");
    const focus = await appearance(input);
    const surface = await appearance(page.locator("form.composer"));
    assert(focus.focused && focus.outline.width >= 2 && focus.outline.style === "solid", "forced-colors input needs a visible outline");
    assert(contrast(focus.outline.color, surface.background) >= 3, "forced-colors outline lacks 3:1 contrast");
    assert.equal(focus.image, "none", "forced-colors must use a system outline instead of a background-image cue");
    await capture("quiet-controls-forced-colors-focus");
    await page.locator(".chat-window-options > summary").click();
    const menu = await appearance(page.locator(".chat-window-menu"));
    assert(menu.borders.every((border) => border.width >= 1 && contrast(border.color, menu.background) >= 3), "forced-colors menu edge is not visible");
    await capture("quiet-controls-forced-colors-menu");
    await page.keyboard.press("Escape");
    await input.fill("");
  } finally { await page.emulateMedia({ forcedColors: "none" }); }
}

/** Computed styles plus real pointer/keyboard states; never submits a model request. */
export async function chatQuietControlsProof(ctx) {
  const { page, app, fixture, check } = ctx;
  const window = await app.browserWindow(page);
  const size = await window.evaluate((win) => win.getContentSize());
  const before = fixture.requests.length;
  assert.equal(await page.locator("#vanta-composer").inputValue(), "");
  await window.evaluate((win) => win.setContentSize(1440, 900));
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
    await check(`${theme} composer remains quiet while focused and typing`, () => composerStates(ctx, theme));
    await check(`${theme} starters are borderless with hover and visible keyboard focus`, () => starterStates(ctx, theme));
    await check(`${theme} model, access, workspace, tools and capture menus use quiet surfaces`, () => menuStates(ctx, theme));
    await check(`${theme} quiet controls and open menus fit the narrow window`, () => narrowStates(ctx, theme));
    await check(`${theme} Appearance settings have insets and compact theme choices`, () => appearanceSettings(ctx, theme));
  }
  await check("forced-colors restores visible system focus and menu boundaries", () => forcedColorStates(ctx));
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  await page.locator("#vanta-composer").fill("");
  await window.evaluate((win, dimensions) => win.setContentSize(...dimensions), size);
  assert.equal(fixture.requests.length, before, "visual control checks must not submit or retry a model request");
}
