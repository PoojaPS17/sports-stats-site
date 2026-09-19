import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { LegalPage } from "@/components/LegalPage";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
import { GA_ID } from "@/lib/consent";

export const metadata = pageMeta("Privacy Policy", `How ${SITE_NAME} handles visitor data: what is collected, why, how long it is kept, and your choices.`, "/privacy");

const UPDATED = "September 19, 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <p>
        {SITE_NAME} is an independent sports statistics website. This policy explains what information the site collects
        when you visit, what it is used for, and the choices you have. The short version: there are no accounts, no
        sign-ups, no advertising cookies, and we do not sell or share personal data.{" "}
        {GA_ID
          ? "We count match-page views anonymously, and we use Google Analytics to measure visits, asking first wherever the law requires consent."
          : "The only measurement we do is an anonymous count of which match pages are viewed."}
      </p>

      <h2>Who operates this site</h2>
      <p>
        {SITE_NAME} is operated independently. It is not owned by, affiliated with, endorsed by or connected to any
        league, club, federation, broadcaster, betting company or data provider, including ESPN, UEFA, the Premier League, the Bundesliga, Serie A,
        LaLiga, the National Football League, the National Basketball Association, the Board of Control for Cricket in
        India, the ATP, the WTA or Formula 1.
      </p>

      <h2>Information we collect</h2>
      <h3>Anonymous page-view counts</h3>
      <p>
        When you open a match page, the site records that the page was viewed. Alongside the view it stores the country
        the request appeared to come from, as reported by our hosting provider from the network address, and a coarse
        device type (phone, tablet or desktop) derived from the browser&apos;s user-agent string. The network address
        itself is not stored by us, and the record contains no identifier that links views together or to a person. These
        counts power the &ldquo;Top Games&rdquo; page, which ranks matches by how often they are viewed.
      </p>
      {GA_ID && (
        <>
          <h3>Visitor statistics (Google Analytics)</h3>
          <p>
            To count visits and see which pages are read, the site uses Google Analytics, a service of Google. It sets
            first-party cookies in your browser (named <code>_ga</code> and <code>_ga_</code> followed by an id, kept for
            up to two years) that tell one browser from another. Through them Google receives, on our behalf, the pages
            you open, the site you arrived from, your approximate location (city or country, worked out from your network
            address, which Google Analytics does not keep), and your browser, operating system and device type. We see
            this only as totals and cannot identify you from it. Advertising features and ad personalisation are switched
            off.
          </p>
          <p>
            If you are in the European Economic Area, the United Kingdom or Switzerland, these cookies are set only after
            you choose &ldquo;Allow analytics&rdquo; on the banner. Elsewhere they are set when you arrive. Wherever you
            are, you can change your choice here at any time, and the site works the same either way.
          </p>
          <p>
            <CookieSettingsButton />
          </p>
          <p>
            Google&apos;s own account of how it handles this data is at{" "}
            <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
              policies.google.com/technologies/partner-sites
            </a>
            , and Google offers a browser add-on that blocks Analytics on every site.
          </p>
        </>
      )}
      <h3>Preferences stored in your browser</h3>
      <p>
        Choosing light or dark mode saves that preference in your browser&apos;s local storage. It never leaves your
        device and can be cleared through your browser settings.
      </p>
      <h3>Hosting and security logs</h3>
      <p>
        Like every website, the site is served by a hosting provider (currently Vercel) whose infrastructure keeps
        short-lived technical logs, such as request timestamps and network addresses, for security, abuse prevention and
        reliability. These are governed by the provider&apos;s own policies and are not used by us to identify visitors.
      </p>
      <h3>Search</h3>
      <p>
        Text you type into the site search is used only to return results for that request. It is not stored against
        any visitor profile.
      </p>
      <h3>Email you send us</h3>
      <p>
        If you write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, we receive your email address and whatever
        you put in the message. We use it only to reply and to deal with what you raised, do not add it to any mailing
        list, and delete the correspondence once the matter is closed unless the law requires us to keep it.
      </p>
      <h3>What we do not collect</h3>
      <ul>
        <li>No names, email addresses, passwords or payment details through the site itself. It has no accounts and sells nothing.</li>
        <li>{GA_ID ? "No advertising cookies and no cross-site tracking. The only cookies are the Google Analytics ones described above." : "No advertising or analytics cookies set by us, and no cross-site tracking."}</li>
        <li>No precise location. {GA_ID ? "Country-level geography from the hosting provider, and the approximate city or country Google Analytics reports." : "Country-level geography only, from the hosting provider."}</li>
      </ul>

      <h2>Calendar feeds</h2>
      <p>
        If you subscribe to a fixtures calendar, your calendar application fetches a public feed from this site on a
        schedule. That request is handled like any other page view and is not linked to you.
      </p>

      <h2>Third-party content</h2>
      <p>
        Team crests, player photographs and news images are loaded from the content networks of their respective rights
        holders and data providers. When your browser fetches those images, the network operator receives your network
        address and standard request headers, as it would on any site embedding their content. News headlines link to the
        publisher&apos;s own website, which has its own privacy policy. Links to Google Calendar, Outlook and similar
        services take you to those providers, whose policies then apply.
      </p>

      <h2>Advertising</h2>
      <p>
        The site does not currently show advertising. If advertising is introduced in future, this policy will be updated
        first, any advertising partner and its use of cookies will be named here, and visitors in regions where consent is
        required will be asked before any advertising cookie is set.
      </p>

      <h2>Children</h2>
      <p>
        The site is general-audience sports information. It does not knowingly collect personal information from
        anyone, including children, and asks for no names, contact details or accounts.
      </p>

      <h2>Data retention</h2>
      <p>
        Anonymous page-view counts are kept indefinitely as aggregate statistics; because they contain no personal
        identifier, they cannot be traced back to an individual.{GA_ID && " Google Analytics keeps visit-level data for no more than 14 months; totals are kept longer."} Hosting logs are retained by the provider for a short
        period under its own retention rules.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have rights under laws such as the EU and UK General Data Protection
        Regulation, the California Consumer Privacy Act or India&apos;s Digital Personal Data Protection Act to access,
        correct or delete personal data, or to object to its processing. Unless you have emailed us, this site holds no data that
        identifies you, so there is normally nothing to retrieve or delete.{GA_ID && " You can withdraw consent to analytics cookies at any time with the button above, and clearing your browser's cookies removes them."} If you believe otherwise, contact us and we will look into it
        promptly.
      </p>

      <h2>Security</h2>
      <p>
        The site is served over HTTPS. Its database holds public sports data and anonymous counts only, and access to it
        is restricted to the site&apos;s own services.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If the way the site handles data changes, this page will be updated and the date at the top revised. Material
        changes, such as introducing advertising or a different analytics tool, will be noted here before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also the{" "}
        <Link href="/contact">Contact page</Link> and the <Link href="/terms">Terms of Use</Link>.
      </p>
    </LegalPage>
  );
}
