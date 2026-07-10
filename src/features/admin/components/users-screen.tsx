import { getTranslations } from "next-intl/server";
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

// Read only for now. Admin-created users land in a later iteration; the authorization
// helpers this screen sits behind are already the ones that flow will need.
export async function UsersScreen() {
  const t = await getTranslations("admin.users");
  const tn = await getTranslations("nav");

  const users = await prisma.appUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      company: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "CECODES_ADMIN" ? "default" : "secondary"}>
                      {user.role === "CECODES_ADMIN"
                        ? tn("roleBadge.admin")
                        : tn("roleBadge.company")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.company?.name ?? t("noCompany")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
