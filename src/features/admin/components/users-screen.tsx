import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/server";
import { UserDialog } from "./user-dialog";
import { UserRowActions } from "./user-row-actions";

// Full CECODES-admin CRUD over user accounts. This is a server component: it fetches, computes
// "is this my own row?" on the server, and delegates every mutation to a client island.
export async function UsersScreen() {
  const t = await getTranslations("admin.users");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  // requireAdmin() is the correct rendering guard here, and it gives us the current admin's id
  // so the self row can drop its actions on the server rather than trusting the client.
  const currentAdmin = await requireAdmin();

  const [users, companies] = await Promise.all([
    prisma.appUser.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ active: "desc" }, { email: "asc" }],
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <UserDialog companies={companies} />
      </div>

      {users.length === 0 ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("company")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("createdAt")}</TableHead>
                <TableHead className="w-0 text-right">
                  <span className="sr-only">{tc("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentAdmin.id;
                const isAdmin = user.role === "CECODES_ADMIN";
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{user.email}</span>
                        {isSelf ? (
                          <Badge variant="outline">{t("you")}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isAdmin ? "default" : "secondary"}>
                        {isAdmin ? t("roleAdmin") : t("roleCompany")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.company?.name ?? t("noCompany")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.active ? "secondary" : "outline"}>
                        {user.active ? t("active") : t("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {/* es-CO product: pin the zone so the date is stable and localized. */}
                      {format.dateTime(user.createdAt, {
                        dateStyle: "medium",
                        timeZone: "America/Bogota",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {isSelf ? null : (
                        <UserRowActions
                          user={{
                            id: user.id,
                            email: user.email,
                            role: user.role,
                            companyId: user.company?.id ?? null,
                            active: user.active,
                          }}
                          companies={companies}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
