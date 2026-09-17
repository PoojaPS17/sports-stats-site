import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { LegalPage } from "@/components/LegalPage";

export const metadata = pageMeta("Terms of Use", `The terms that apply to using ${SITE_NAME}: what the site is, what it is not, where its data comes from, and the limits of its accuracy.`, "/terms");

const UPDATED = "September 17, 2026";
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated={UPDATED}>
      <p>
        By using {SITE_NAME} (the &ldquo;site&rdquo;) you agree to these terms. They are written in plain language on
        purpose. If you do not agree with them, please do not use the site.
      </p>

      <h2>1. What the site is</h2>
      <p>
        {SITE_NAME} is a free, independent reference site that presents sports scores, fixtures, standings, player
        statistics and analysis derived from them. It is provided for personal, informational and entertainment purposes
        only. It sells nothing, takes no payments and has no user accounts.
      </p>

      <h2>2. Independence and non-affiliation</h2>
      <p>
        The site is not owned by, affiliated with, sponsored by, endorsed by or connected to any sports league, club,
        governing body, player, broadcaster, betting operator or data provider. In particular it has no relationship with
        ESPN, UEFA, the Premier League, LaLiga, the Bundesliga, Serie A, the National Football League, the National Basketball Association, the Indian
        Premier League or the Board of Control for Cricket in India, Cricket Australia, the International Cricket Council,
        the ATP Tour, the WTA, or Formula 1 and the FIA. References to any of them are for identification only and imply
        no association.
      </p>

      <h2>3. Data sources and attribution</h2>
      <p>
        Scores, schedules, standings and statistics are compiled from publicly available sports data. The site adds its
        own presentation, calculations and analysis, such as head-to-head records, power ratings, records lists and season
        projections. The site does not claim ownership of the underlying facts, which belong to no one, nor of any
        third-party material. Where a data source&apos;s name appears on the site, it is stated as a matter of
        attribution and not as an endorsement.
      </p>

      <h2>4. Trademarks, logos and images</h2>
      <p>
        Team names, club crests, league names and logos, competition names, player names and photographs, and all other
        brand features are the trademarks, copyrights or other property of their respective owners. They are displayed
        solely to identify the teams, competitions and people that the statistics refer to, in the same way a newspaper
        results page would, and not to suggest sponsorship or approval. No licence to use any of them is granted by this
        site. All such assets remain the property of their respective owners.
      </p>

      <h2>5. Requests from rights holders</h2>
      <p>
        We respect intellectual property. If you are a rights holder, or act for one, and believe that material on this
        site infringes your rights or is displayed without appropriate permission, contact us with the page address and a
        description of the material. We will review the request promptly and remove or alter the material where
        appropriate. We aim to respond to such requests within a few business days.
      </p>

      <h2>6. Accuracy and no warranty</h2>
      <p>
        The site is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. Data is gathered automatically and
        refreshed on a schedule, and errors, delays, omissions and gaps happen: a score may lag, a fixture may move, a
        statistic may be missing for an older game, and a name may be spelt differently from an official source. Nothing
        on the site should be treated as an official record. Where a figure matters to you, verify it with the league or
        competition concerned. To the fullest extent permitted by law we give no warranty of accuracy, completeness,
        timeliness or fitness for any purpose.
      </p>

      <h2>7. Projections, ratings and analysis</h2>
      <p>
        Power rankings, win probabilities, season projections, records and comparisons are statistical estimates produced
        by the site&apos;s own models from past results. They are opinions expressed as numbers, not predictions of what
        will happen, and they do not take account of injuries, transfers, suspensions, weather or anything else outside the
        results record. Each such page explains its method. They are published for interest and discussion only.
      </p>

      <h2>8. No betting, gambling or financial advice</h2>
      <p>
        The site does not offer, facilitate, promote or advertise betting or gambling of any kind, does not accept wagers,
        does not display bookmaker prices and has no commercial relationship with any betting operator. Nothing on the
        site is advice to place a bet or to make any financial decision, and it must not be relied on for that purpose.
        Where betting is lawful, it carries risk; where it is not, the site must not be used in connection with it.
      </p>

      <h2>9. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the site for any unlawful purpose or in breach of any applicable law;</li>
        <li>attempt to gain unauthorised access to the site, its servers or its database;</li>
        <li>interfere with the site&apos;s operation, for example through excessive automated requests that degrade it for others;</li>
        <li>present the site&apos;s content as an official source of any league or competition;</li>
        <li>remove or obscure any attribution or notice that appears on the site.</li>
      </ul>
      <p>
        Reasonable personal use, including subscribing to calendar feeds and linking to pages, is welcome. If you would
        like to reuse the site&apos;s own analysis more widely, ask first.
      </p>

      <h2>10. Links to other sites</h2>
      <p>
        News headlines and some other items link to third-party websites. Those sites are not under our control and we
        are not responsible for their content, accuracy or policies. A link is provided for convenience and is not an
        endorsement.
      </p>

      <h2>11. Availability and changes</h2>
      <p>
        We may change, suspend or withdraw any part of the site at any time without notice, including the data shown,
        the competitions covered and the features offered. We may also update these terms; the date at the top shows the
        current version, and continued use after a change means you accept it.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the site and its operator will not be liable for any loss or damage of
        any kind arising from your use of, or inability to use, the site or its content, including any decision made in
        reliance on information found here. Nothing in these terms excludes liability that cannot be excluded by law.
      </p>

      <h2>13. Privacy</h2>
      <p>
        How the site handles visitor information is described in the <Link href="/privacy">Privacy Policy</Link>, which
        forms part of these terms.
      </p>

      <h2>14. General</h2>
      <p>
        If any part of these terms is found to be unenforceable, the rest continues to apply. These terms are governed by
        the laws of the country in which the site&apos;s operator is established, and any dispute will be subject to the
        courts there, without prejudice to any mandatory consumer protection you enjoy where you live.
      </p>

      <h2>15. Contact</h2>
      <p>
        {CONTACT ? (
          <>
            Questions about these terms, and requests under section 5, can be sent to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </>
        ) : (
          <>Questions about these terms, and requests under section 5, can be raised through the contact details published on this site.</>
        )}
      </p>
    </LegalPage>
  );
}
