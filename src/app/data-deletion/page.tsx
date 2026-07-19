import type { Metadata } from "next";
import Link from "next/link";
import { PublicLegalPage } from "@/components/public-legal-layout";
import {
  COMPANY_WEBSITE_URL,
  CONTACT_EMAIL,
  PUBLIC_APPLICATION_ORIGIN,
  createLegalMetadata,
} from "@/lib/legal";

export const metadata: Metadata = createLegalMetadata({
  title: "User Data Deletion Instructions | Social Media Manager",
  description:
    "Instructions for requesting deletion of Facebook-connected information from the NC Tile Pros LLC Social Media Manager application.",
  path: "/data-deletion",
});

export default function DataDeletionPage() {
  return (
    <PublicLegalPage
      title="User Data Deletion Instructions"
      summary={
        <>
          <p>
            The Social Media Manager application is an internal application operated by NC Tile
            Pros LLC.
          </p>
          <p>
            You may request deletion of information associated with a Facebook
            account connected to the Application by following the instructions below.
          </p>
        </>
      }
    >
      <section>
        <h2>Option 1: Submit a Deletion Request by Email</h2>
        <p>
          Send an email to: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          Use the subject: <strong>Social Media Manager Data Deletion Request</strong>
        </p>
        <p>Include the following information:</p>
        <ul>
          <li>Your name.</li>
          <li>The Facebook Page name involved.</li>
          <li>The email address associated with your request.</li>
          <li>A brief description of the information you want deleted.</li>
        </ul>
        <p>
          Do not email passwords, access tokens, payment information, or other sensitive
          authentication information.
        </p>
        <p>
          We may ask for reasonable verification to confirm that you are authorized to request
          deletion for the connected account.
        </p>
      </section>

      <section>
        <h2>Option 2: Remove the Application Through Meta</h2>
        <p>
          You may remove the Application from the applicable Facebook account
          settings.
        </p>
        <p>
          Removing the Application generally revokes its future access to the connected account.
          It may not automatically remove information previously stored by the Application.
        </p>
        <p>
          To request deletion of information already stored, also send an email using the
          instructions above.
        </p>
      </section>

      <section>
        <h2>What We Will Delete</h2>
        <p>
          After verifying a valid request, we will delete or anonymize applicable information
          associated with the connected account, which may include:
        </p>
        <ul>
          <li>Meta user or Page identifiers.</li>
          <li>Stored Meta access tokens.</li>
          <li>Granted-permission records.</li>
          <li>Connected-account information.</li>
          <li>Scheduled or draft posts associated with the account.</li>
          <li>Publishing records and platform post identifiers.</li>
          <li>Uploaded media associated only with the requested account.</li>
          <li>Related technical information that is no longer required.</li>
        </ul>
      </section>

      <section>
        <h2>Information We May Retain</h2>
        <p>We may retain limited information when reasonably necessary to:</p>
        <ul>
          <li>Comply with a legal obligation.</li>
          <li>Establish or defend legal claims.</li>
          <li>Prevent fraud, abuse, or security incidents.</li>
          <li>Document that a deletion request was completed.</li>
          <li>Meet applicable Meta Platform requirements.</li>
        </ul>
        <p>
          Any retained information will remain protected and will not be used for unrelated
          purposes.
        </p>
      </section>

      <section>
        <h2>Processing Time</h2>
        <p>
          We will review and process verified deletion requests within a reasonable period and
          ordinarily within 30 days.
        </p>
        <p>
          We will confirm completion using the email address supplied with the request unless we
          are legally prohibited from doing so.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions concerning deletion requests may be sent to:</p>
        <address>
          <strong>NC Tile Pros LLC</strong>
          <br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <br />
          Website:{" "}
          <a href={COMPANY_WEBSITE_URL} target="_blank" rel="noopener noreferrer">
            {COMPANY_WEBSITE_URL}
          </a>
        </address>
        <div className="public-legal-related">
          <h3>Related documents</h3>
          <ul>
            <li>
              <Link href="/privacy">Privacy Policy: {PUBLIC_APPLICATION_ORIGIN}/privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms of Use: {PUBLIC_APPLICATION_ORIGIN}/terms</Link>
            </li>
          </ul>
        </div>
      </section>
    </PublicLegalPage>
  );
}
