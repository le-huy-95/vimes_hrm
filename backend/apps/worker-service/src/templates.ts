import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const SITE_NAME = "Vimes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(__dirname, "../templates");

Handlebars.registerPartial(
  "layout",
  fs.readFileSync(path.join(templatesDir, "layout.hbs"), "utf8"),
);

const cache = new Map<string, HandlebarsTemplateDelegate>();

function compile(name: string): HandlebarsTemplateDelegate {
  const hit = cache.get(name);
  if (hit) return hit;
  const source = fs.readFileSync(path.join(templatesDir, `${name}.hbs`), "utf8");
  const tpl = Handlebars.compile(source);
  cache.set(name, tpl);
  return tpl;
}

export function renderTemplate(
  name: "otp-verify" | "otp-reset" | "org-invite",
  data: Record<string, unknown>,
): string {
  const tpl = compile(name);
  return tpl({
    siteName: SITE_NAME,
    currentYear: new Date().getFullYear(),
    ...data,
  });
}

export { SITE_NAME };
