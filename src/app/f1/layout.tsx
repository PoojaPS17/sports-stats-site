import { SubNav } from "@/components/SubNav";

export default function F1Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav
        title="Formula 1"
        titleHref="/f1"
        tabs={[
          { label: "Calendar", href: "/f1", exact: true },
          { label: "Standings", href: "/f1/standings" },
        ]}
      />
      {children}
    </>
  );
}
