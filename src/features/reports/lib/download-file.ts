// Shared by export-buttons.tsx (Reports page) and the dashboard's download-view-button.tsx: fetch
// the file, then trigger a save from the in-memory blob. Fetching (rather than a bare anchor
// navigation) is what gives both callers a completion/failure signal to drive their toast.
export async function downloadReportFile(url: string): Promise<{ error?: string }> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { error: "generic" }; // network or transport failure
  }

  if (!response.ok) {
    let key = "generic";
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string") key = body.error;
    } catch {
      // Non-JSON error body; keep the generic key.
    }
    return { error: key };
  }

  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get("content-disposition"));
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename ?? "reporte";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the click has been handed to the browser, so the download is not cut off.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return {};
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^"]+?)"?(?:;|$)/i.exec(header);
  return match ? match[1] : null;
}
