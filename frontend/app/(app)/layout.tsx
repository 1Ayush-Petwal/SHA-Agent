import { Suspense } from "react";
import { NavLinks, SiteNav } from "@/components/site-nav";

const STATIC_LINKS = (
  <>
    <span className="py-1.5 text-sm font-[550] text-muted-foreground">Ask</span>
    <span className="py-1.5 text-sm font-[550] text-muted-foreground">Evals</span>
  </>
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[960px] px-4 pb-12 sm:px-6">
      {/* usePathname is request data on dynamic routes, so it needs a Suspense boundary under cacheComponents. */}
      <SiteNav
        links={
          <Suspense fallback={STATIC_LINKS}>
            <NavLinks />
          </Suspense>
        }
      />
      <main>{children}</main>
    </div>
  );
}
