// LocalPay's own palette (docs/PLAN.md "Design system"), scoped inside a shadow root
// so nothing leaks into or out of the merchant page. No web fonts: works offline.
export const STYLES = `
:host { all: initial; }
.lp-overlay {
  --lp-primary: #2563EB; --lp-primary-hover: #1D4ED8; --lp-accent: #F59E0B;
  --lp-ink: #0F172A; --lp-muted: #475569; --lp-surface: #FFFFFF; --lp-canvas: #F6F8FA;
  --lp-border: #E2E8F0; --lp-success: #15803D; --lp-danger: #B91C1C;
  --lp-banner-bg: #FEF3C7; --lp-banner-ink: #78350F;
  position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
  background: rgba(15, 23, 42, 0.55); padding: 16px; box-sizing: border-box;
  font: 14px/1.45 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--lp-ink);
}
.lp-sheet {
  width: 100%; max-width: 420px; max-height: calc(100vh - 32px); overflow: auto; background: var(--lp-surface);
  border-radius: 12px; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.35); box-sizing: border-box;
}
.lp-banner {
  background: var(--lp-banner-bg); color: var(--lp-banner-ink); font-weight: 600; font-size: 12px;
  letter-spacing: 0.02em; text-align: center; padding: 8px 12px; border-radius: 12px 12px 0 0;
}
.lp-header { display: flex; justify-content: space-between; gap: 12px; padding: 16px 20px 8px; }
.lp-title { margin: 0; font-size: 16px; font-weight: 600; }
.lp-desc { margin: 2px 0 0; color: var(--lp-muted); }
.lp-close {
  border: 0; background: transparent; color: var(--lp-muted); font-size: 22px; line-height: 1; cursor: pointer;
  width: 32px; height: 32px; border-radius: 6px; flex: none;
}
.lp-close:hover, .lp-close:focus-visible { background: var(--lp-canvas); color: var(--lp-ink); }
.lp-amount { padding: 0 20px; font-size: 26px; font-weight: 700; }
.lp-id { padding: 2px 20px 12px; color: var(--lp-muted); font-size: 12px; display: flex; align-items: center; gap: 6px; }
.lp-mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.lp-copy { border: 1px solid var(--lp-border); background: var(--lp-surface); border-radius: 4px; font-size: 11px; padding: 1px 6px; cursor: pointer; color: var(--lp-ink); }
.lp-tabs { display: flex; gap: 4px; padding: 0 20px; border-bottom: 1px solid var(--lp-border); overflow-x: auto; }
.lp-tab {
  border: 0; background: transparent; padding: 10px 10px; cursor: pointer; color: var(--lp-muted); font: inherit;
  border-bottom: 2px solid transparent; white-space: nowrap;
}
.lp-tab[aria-selected="true"] { color: var(--lp-primary); border-bottom-color: var(--lp-primary); font-weight: 600; }
.lp-body { padding: 14px 20px 18px; display: grid; gap: 8px; }
.lp-scenario {
  text-align: left; border: 1px solid var(--lp-border); background: var(--lp-surface); border-radius: 8px;
  padding: 10px 12px; cursor: pointer; font: inherit; color: var(--lp-ink); display: grid; gap: 2px;
}
.lp-scenario:hover, .lp-scenario:focus-visible { border-color: var(--lp-primary); }
.lp-scenario.lp-primary { background: var(--lp-primary); border-color: var(--lp-primary); color: #FFFFFF; }
.lp-scenario.lp-primary:hover, .lp-scenario.lp-primary:focus-visible { background: var(--lp-primary-hover); }
.lp-scenario[disabled] { opacity: 0.6; cursor: progress; }
.lp-label { font-weight: 600; }
.lp-effect { font-size: 12px; color: var(--lp-muted); }
.lp-primary .lp-effect { color: #FFFFFF; }
.lp-alert { border-radius: 8px; padding: 10px 12px; background: #FEF2F2; color: var(--lp-danger); border: 1px solid #FECACA; }
.lp-dismiss { justify-self: center; border: 0; background: transparent; color: var(--lp-muted); text-decoration: underline; cursor: pointer; font: inherit; padding: 6px; }
.lp-footer { padding: 10px 20px 14px; border-top: 1px solid var(--lp-border); color: var(--lp-muted); font-size: 11px; text-align: center; }
:focus-visible { outline: 2px solid var(--lp-accent); outline-offset: 2px; }
@media (max-width: 400px) { .lp-overlay { padding: 8px; } .lp-header, .lp-amount, .lp-id, .lp-body { padding-left: 14px; padding-right: 14px; } .lp-tabs { padding: 0 10px; } }
`;
