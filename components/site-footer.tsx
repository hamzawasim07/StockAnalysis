import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t">
      <div className="text-muted-foreground mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Data scraped from{" "}
          <Link href="https://dps.psx.com.pk" className="hover:text-foreground underline underline-offset-2">
            dps.psx.com.pk
          </Link>{" "}
          and{" "}
          <Link href="https://www.khistocks.com" className="hover:text-foreground underline underline-offset-2">
            khistocks.com
          </Link>
          . Not affiliated with either.
        </p>
        <p>
          For personal, non-commercial analysis only — not investment advice, and not a real-time feed.
        </p>
      </div>
    </footer>
  );
}
