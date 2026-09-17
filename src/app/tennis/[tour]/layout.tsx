import { notFound } from "next/navigation";
import { isTour, TOUR_LABEL, TOURS } from "@/lib/tennisTours";
import { SubNav } from "@/components/SubNav";

export function generateStaticParams() {
  return TOURS.map((tour) => ({ tour }));
}

export default async function TennisTourLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tour: string }>;
}) {
  const { tour } = await params;
  if (!isTour(tour)) notFound();
  return (
    <>
      <SubNav
        title={`${TOUR_LABEL[tour]} Tennis`}
        titleHref={`/tennis/${tour}`}
        tabs={[
          { label: "Scores", href: `/tennis/${tour}`, exact: true },
          { label: "Rankings", href: `/tennis/${tour}/rankings` },
        ]}
      />
      {children}
    </>
  );
}
