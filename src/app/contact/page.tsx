import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { LegalPage } from "@/components/LegalPage";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/structuredData";

export const metadata = pageMeta("Contact", `How to reach ${SITE_NAME}: report a wrong score or stat, send a rights-holder request, or ask about privacy, advertising and partnerships.`, "/contact");

function mailto(subject: string) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export default function ContactPage() {
  return (
    <LegalPage title="Contact" subtitle={`One address for everything about ${SITE_NAME}.`}>
      <JsonLd data={breadcrumbSchema([{ label: "Contact" }])} />
      <p>
        Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. {SITE_NAME} is a small independent site, and every message is
        read by a person. The notes below say what to include so we can act on it the first time.
      </p>

      <h2>Report a wrong score or stat</h2>
      <p>
        Data is compiled automatically from public sources and mistakes do get through. If a result, scorecard, stat line,
        player or team detail is wrong or missing, <a href={mailto("Correction")}>send a correction</a> with:
      </p>
      <ul>
        <li>the address of the page where you saw it;</li>
        <li>what it says, and what it should say;</li>
        <li>a source we can check it against, if you have one.</li>
      </ul>

      <h2>Rights holders and photo credits</h2>
      <p>
        If you own, or act for the owner of, a photograph, crest, logo or other material shown here and want it credited
        differently, changed or removed, <a href={mailto("Rights-holder request")}>send a request</a> with the page
        address and a description of the material. We review these first and aim to reply within a few business days.
        Section 5 of the <Link href="/terms">Terms of Use</Link> sets out how they are handled.
      </p>

      <h2>Privacy questions</h2>
      <p>
        The site has no accounts and holds nothing that identifies you, as the <Link href="/privacy">Privacy Policy</Link>{" "}
        explains. If you have a question about it, or want to make a request under a data protection law,{" "}
        <a href={mailto("Privacy")}>write to the same address</a>.
      </p>

      <h2>Advertising, partnerships and press</h2>
      <p>
        For advertising, data or content partnerships, or questions from journalists,{" "}
        <a href={mailto("Partnership enquiry")}>get in touch</a> and say who you are and what you have in mind. We do not
        work with betting or gambling operators.
      </p>

      <h2>Feedback and ideas</h2>
      <p>
        Found something broken, slow or hard to read, or want a competition or a stat that is not here yet?{" "}
        <a href={mailto("Feedback")}>Tell us</a>, and mention the device and browser you were using if it is a bug.
      </p>

      <h2>What we cannot help with</h2>
      <ul>
        <li>
          {SITE_NAME} is not a league, club, federation or broadcaster, and cannot pass messages to teams or players.
        </li>
        <li>We do not sell tickets or merchandise, and do not carry live streams or say where to find them.</li>
        <li>We do not give betting tips or predictions on request.</li>
      </ul>
    </LegalPage>
  );
}
