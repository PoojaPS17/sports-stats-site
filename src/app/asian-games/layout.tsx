import { SubNav } from "@/components/SubNav";

export default function AsianGamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav
        title="Asian Games"
        titleHref="/asian-games"
        tabs={[
          { label: "Overview", href: "/asian-games", exact: true },
          { label: "Medal Tally", href: "/asian-games/medal-tally" },
        ]}
      />
      {children}
    </>
  );
}
