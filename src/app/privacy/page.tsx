import type { Metadata } from "next";
import { PublicLegalPage } from "@/components/public-legal-layout";
import {
  COMPANY_WEBSITE_URL,
  CONTACT_EMAIL,
  PUBLIC_APPLICATION_ORIGIN,
  createLegalMetadata,
} from "@/lib/legal";

export const metadata: Metadata = createLegalMetadata({
  title: "Privacy Policy | Social Media Manager",
  description:
    "Privacy Policy for the NC Tile Pros LLC internal Social Media Manager application.",
  path: "/privacy",
});

export default function PrivacyPolicyPage() {
  return (
    <PublicLegalPage
      title="Privacy Policy"
      summary={
        <>
          <p>
            NC Tile Pros LLC (&ldquo;NC Tile Pros,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) operates the Social Media Manager application available at{" "}
            <a href={PUBLIC_APPLICATION_ORIGIN}>{PUBLIC_APPLICATION_ORIGIN}</a> (the
            &ldquo;Application&rdquo;).
          </p>
          <p>
            The Application is an internal business tool used by NC Tile Pros LLC to manage
            content for its own social media accounts. It is not currently offered as a public
            social media management service.
          </p>
        </>
      }
    >
      <section>
        <h2>1. Information We Process</h2>
        <p>
          When the Application is connected to Meta products, including Facebook,
          we may receive and process information made available through Meta&apos;s APIs. Depending
          on the permissions granted, this information may include:
        </p>
        <ul>
          <li>Facebook account identifiers.</li>
          <li>Facebook Page identifiers and Page names.</li>
          <li>Basic profile or business account information.</li>
          <li>Meta access tokens and token expiration information.</li>
          <li>Permissions granted to the Application.</li>
          <li>
            Posts, captions, hashtags, media references, publishing identifiers, publishing
            status, and error information.
          </li>
          <li>
            Information needed to create, schedule, publish, or verify content on connected
            Facebook Pages.
          </li>
        </ul>
        <p>
          The Application may also store information entered or uploaded directly by its
          authorized administrator, including:
        </p>
        <ul>
          <li>Images and videos.</li>
          <li>Captions and hashtags.</li>
          <li>Draft posts.</li>
          <li>Scheduled publishing dates and times.</li>
          <li>Per-platform content settings.</li>
          <li>Internal application account and configuration information.</li>
          <li>Publishing history and technical logs.</li>
        </ul>
        <p>
          The Application does not intentionally collect private Facebook messages, personal
          contact lists, financial information, or sensitive personal information through
          Meta&apos;s APIs.
        </p>
      </section>

      <section>
        <h2>2. How We Use Information</h2>
        <p>
          We use the information processed by the Application only for legitimate application
          and business purposes, including to:
        </p>
        <ul>
          <li>Authenticate and maintain authorized connections to Meta accounts.</li>
          <li>Display connected Facebook Pages.</li>
          <li>Create, schedule, publish, and manage social media content.</li>
          <li>Confirm whether scheduled content was published successfully.</li>
          <li>Diagnose failed publishing attempts and technical problems.</li>
          <li>Protect the Application against unauthorized access or misuse.</li>
          <li>Maintain application security, reliability, and operational records.</li>
          <li>Comply with applicable legal obligations and Meta Platform requirements.</li>
        </ul>
        <p>We do not sell Meta Platform Data or use it to create advertising profiles about individuals.</p>
        <p>We do not provide Meta Platform Data to data brokers.</p>
      </section>

      <section>
        <h2>3. Legal Basis and Authorization</h2>
        <p>
          The Application processes information based on the authorization provided when the
          authorized NC Tile Pros LLC administrator connects the company&apos;s Facebook Page.
        </p>
        <p>
          The Application is intended to process only information associated with accounts that
          NC Tile Pros LLC owns or is authorized to manage.
        </p>
      </section>

      <section>
        <h2>4. How Information Is Shared</h2>
        <p>We do not sell or rent information processed through the Application.</p>
        <p>
          Information may be processed by service providers that support the Application&apos;s
          infrastructure and operation. These may include hosting, cloud infrastructure, network
          routing, database, backup, security, and related information-technology service
          providers.
        </p>
        <p>
          These providers may process information only as necessary to provide their services to
          NC Tile Pros LLC and are not authorized by us to use the information for unrelated
          purposes.
        </p>
        <p>We may also disclose information when reasonably necessary to:</p>
        <ul>
          <li>Comply with applicable law, legal process, or a valid governmental request.</li>
          <li>Protect the rights, property, or safety of NC Tile Pros LLC or others.</li>
          <li>Investigate fraud, abuse, unauthorized access, or security incidents.</li>
          <li>Enforce applicable agreements or policies.</li>
        </ul>
        <p>
          When legally permitted, we seek to review the validity of governmental requests and
          limit any disclosure to the minimum information reasonably required.
        </p>
      </section>

      <section>
        <h2>5. Data Storage and Security</h2>
        <p>
          The Application uses administrative, technical, and physical safeguards designed to
          protect stored information.
        </p>
        <p>These safeguards may include:</p>
        <ul>
          <li>
            HTTPS encryption for information transmitted between browsers, the Application, and
            supported APIs.
          </li>
          <li>Restricted access to production systems.</li>
          <li>Authentication and authorization controls.</li>
          <li>Encryption or protected storage of access tokens.</li>
          <li>Environment-based protection of application secrets.</li>
          <li>Database access controls.</li>
          <li>Logging and monitoring intended to identify operational or security problems.</li>
        </ul>
        <p>
          No method of transmission or electronic storage is completely secure. We therefore
          cannot guarantee absolute security, but we take reasonable measures appropriate to the
          nature and limited use of the Application.
        </p>
      </section>

      <section>
        <h2>6. Data Retention</h2>
        <p>
          We retain information only for as long as reasonably necessary to operate the
          Application, maintain publishing records, troubleshoot technical issues, meet legal
          obligations, or comply with Meta Platform requirements.
        </p>
        <p>
          Access tokens may be retained while a Meta account remains connected to the
          Application. Tokens may be deleted, invalidated, or replaced when:
        </p>
        <ul>
          <li>The account is disconnected.</li>
          <li>Authorization is revoked.</li>
          <li>A token expires.</li>
          <li>The Application&apos;s access is removed through Facebook settings.</li>
          <li>A valid deletion request is received.</li>
          <li>The Application is discontinued.</li>
        </ul>
        <p>
          Scheduled posts, uploaded media, publishing records, and related technical information
          may be retained until deleted by the administrator or until no longer reasonably
          necessary.
        </p>
      </section>

      <section>
        <h2>7. User Data Deletion</h2>
        <p>
          An authorized user may request deletion of information associated with their Meta
          account or the Application.
        </p>
        <p>
          Deletion instructions are available at:{" "}
          <a href={`${PUBLIC_APPLICATION_ORIGIN}/data-deletion`}>
            {PUBLIC_APPLICATION_ORIGIN}/data-deletion
          </a>
        </p>
        <p>
          A deletion request may also be submitted by emailing:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          The request should include enough information to identify the relevant connected
          account, such as the Facebook Page name or email address
          associated with the request.
        </p>
        <p>
          After verifying the request, we will delete or anonymize applicable information unless
          retention is required by law, necessary for security or fraud prevention, or otherwise
          permitted under applicable Meta Platform requirements.
        </p>
        <p>
          Users may also remove the Application through their Facebook account
          settings. Removing the Application may revoke future access, but a separate deletion
          request may still be needed to request deletion of information previously stored by the
          Application.
        </p>
      </section>

      <section>
        <h2>8. Children&apos;s Privacy</h2>
        <p>
          The Application is an internal business administration tool and is not directed to
          children under 13.
        </p>
        <p>We do not knowingly collect personal information from children through the Application.</p>
      </section>

      <section>
        <h2>9. International Processing</h2>
        <p>
          The Application is operated by NC Tile Pros LLC in the United States. Information
          processed through the Application may be stored or processed in the United States.
        </p>
      </section>

      <section>
        <h2>10. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy to reflect changes to the Application, our data
          practices, legal requirements, or Meta Platform requirements.
        </p>
        <p>
          When we make material changes, we will update the effective date displayed at the top
          of this page.
        </p>
      </section>

      <section>
        <h2>11. Contact Us</h2>
        <address>
          <strong>NC Tile Pros LLC</strong>
          <br />
          Raleigh, North Carolina, United States
          <br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <br />
          Website:{" "}
          <a href={COMPANY_WEBSITE_URL} target="_blank" rel="noopener noreferrer">
            {COMPANY_WEBSITE_URL}
          </a>
        </address>
      </section>
    </PublicLegalPage>
  );
}
