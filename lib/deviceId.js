export function getVisitorId() {
  const KEY = "all_of_kindle_visitor_id";
  let id = localStorage.getItem(KEY);
  if (id) return id;

  id =
    "visitor_" +
    crypto.randomUUID() +
    "_" +
    [
      navigator.userAgent,
      screen.width,
      screen.height,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    ]
      .join("|")
      .replace(/\s+/g, "");

  localStorage.setItem(KEY, id);
  return id;
}
