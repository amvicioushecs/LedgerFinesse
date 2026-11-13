import type { Metadata } from "next";
import { AuditWorkspace } from "@/components/audit-workspace";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Audit workspace · LedgerFinesse",
  description: "Compare your rent ledger to your lease terms.",
};

export default function AuditPage() {
  return (
    <>
      <SiteHeader />
      <AuditWorkspace />
      <SiteFooter />
    </>
  );
}
