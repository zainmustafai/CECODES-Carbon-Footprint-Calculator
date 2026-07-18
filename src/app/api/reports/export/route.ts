import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ScopeError, resolveCompanyScope } from "@/lib/auth/company-scope";
import { loadReport } from "@/features/reports/lib/load-report";
import { buildCsv, buildWorkbook } from "@/features/reports/lib/build-workbook";
import { buildPdf } from "@/features/reports/lib/build-pdf";

// The Excel / CSV export (Requirements 10, 14.7).
//
// A Route Handler runs NO layout, so requireAppUser()/requireAdmin() never execute for it. It is
// exactly as exposed as a Server Action, and resolveCompanyScope is therefore the first thing it
// does. RLS will not save it: Prisma connects as the database owner and bypasses every policy.
//
// One route serves both roles, which is what resolveCompanyScope exists for: a company user may
// only ever resolve their OWN companyId, and an admin must name an existing company explicitly.
// Passing someone else's companyId gets a ScopeError, not a file.
//
// exceljs is a Node library, so this cannot run on the edge.
export const runtime = "nodejs";

const querySchema = z
  .object({
    // Optional: a company user's own id wins regardless of what they send. Only an admin needs it.
    companyId: z.uuid().optional(),
    facilityId: z.uuid(),
    year: z.coerce.number().int().min(1990).max(2100),
    format: z.enum(["xlsx", "csv", "pdf"]).default("xlsx"),
  })
  .strict();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  const { companyId, facilityId, year, format } = parsed.data;

  try {
    // AUTHORIZE FIRST. Everything below this line trusts scope.companyId and nothing else.
    const scope = await resolveCompanyScope({ companyId });

    // loadReport re-scopes the facility on scope.companyId, so a facility id belonging to another
    // company resolves to null rather than to somebody else's data.
    const vm = await loadReport(scope.companyId, facilityId, year);
    if (!vm) return NextResponse.json({ error: "notFound" }, { status: 404 });

    const stamp = `${slug(vm.companyName)}-${slug(vm.facilityName)}-${vm.year}`;

    if (format === "csv") {
      return new NextResponse(buildCsv(vm), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="huella-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "pdf") {
      const pdf = await buildPdf(vm);
      return new NextResponse(pdf as unknown as ArrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="huella-${stamp}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const workbook = buildWorkbook(vm);
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="huella-${stamp}.xlsx"`,
        // The numbers are computed live from the current factor library. Caching a footprint
        // would serve a stale one after an admin corrects a factor.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Opaque, like every other surface: the response must not reveal whether a company or a
    // facility exists.
    if (error instanceof ScopeError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[reports/export]", error);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}

// A filename-safe slug: strip accents, then anything that is not alphanumeric.
function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
}
