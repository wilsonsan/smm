import type { Metadata } from "next";
import { PublicLegalPage } from "@/components/public-legal-layout";
import {
  COMPANY_WEBSITE_URL,
  CONTACT_EMAIL,
  PUBLIC_APPLICATION_ORIGIN,
  createLegalMetadata,
} from "@/lib/legal";

export const metadata: Metadata = createLegalMetadata({
  title: "Terms of Use | Social Media Manager",
  description:
    "Terms of Use for the NC Tile Pros LLC internal Social Media Manager application.",
  path: "/terms",
});

export default function TermsOfUsePage() {
  return (
    <PublicLegalPage
      title="Terms of Use"
      summary={
        <>
          <p>
            These Terms of Use (&ldquo;Terms&rdquo;) govern access to and use of the Social Media
            Manager application available at{" "}
            <a href={PUBLIC_APPLICATION_ORIGIN}>{PUBLIC_APPLICATION_ORIGIN}</a> (the
            &ldquo;Application&rdquo;).
          </p>
          <p>
            The Application is owned and operated by NC Tile Pros LLC (&ldquo;NC Tile Pros,&rdquo;
            &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
          </p>
          <p>By accessing or using the Application, you agree to these Terms.</p>
        </>
      }
    >
      <section>
        <h2>1. Internal Business Application</h2>
        <p>
          The Application is an internal business tool intended for use by NC Tile Pros LLC and
          individuals expressly authorized by NC Tile Pros LLC.
        </p>
        <p>
          The Application is not currently offered as a public subscription service, consumer
          product, or general-purpose social media management platform.
        </p>
        <p>
          No person receives a right to access the Application merely because the Application is
          accessible through the internet.
        </p>
      </section>

      <section>
        <h2>2. Authorized Access</h2>
        <p>
          You may access the Application only if you have been expressly authorized by NC Tile
          Pros LLC.
        </p>
        <p>You agree to:</p>
        <ul>
          <li>Provide accurate authentication information.</li>
          <li>Protect your login credentials.</li>
          <li>Use reasonable security practices.</li>
          <li>Notify NC Tile Pros LLC of suspected unauthorized access.</li>
          <li>
            Access only accounts, Pages, profiles, media, and information you are authorized to
            manage.
          </li>
        </ul>
        <p>
          You may not share credentials with an unauthorized person or attempt to bypass
          authentication or access controls.
        </p>
      </section>

      <section>
        <h2>3. Permitted Use</h2>
        <p>The Application may be used to:</p>
        <ul>
          <li>Connect authorized social media accounts.</li>
          <li>Upload and organize media.</li>
          <li>Create and edit social media content.</li>
          <li>Schedule and publish posts.</li>
          <li>Review publishing status and history.</li>
          <li>
            Perform other internal social media management activities supported by the
            Application.
          </li>
        </ul>
        <p>
          Use of Meta products through the Application is also subject to the applicable terms,
          policies, permissions, and technical requirements established by Meta.
        </p>
      </section>

      <section>
        <h2>4. Prohibited Use</h2>
        <p>You may not use the Application to:</p>
        <ul>
          <li>Access an account without permission.</li>
          <li>Violate any law or regulation.</li>
          <li>
            Violate Meta&apos;s terms, developer policies, platform policies, or community
            standards.
          </li>
          <li>
            Publish unlawful, fraudulent, deceptive, infringing, abusive, or malicious content.
          </li>
          <li>Upload malware or harmful code.</li>
          <li>Interfere with the Application&apos;s operation or security.</li>
          <li>Attempt to obtain another person&apos;s credentials or access tokens.</li>
          <li>
            Reverse engineer or exploit the Application except where applicable law expressly
            permits it.
          </li>
          <li>Use the Application to send spam or engage in coordinated inauthentic behavior.</li>
          <li>Collect, sell, disclose, or misuse information obtained through Meta&apos;s APIs.</li>
        </ul>
      </section>

      <section>
        <h2>5. Social Media Account Authorization</h2>
        <p>
          The Application may access Facebook Pages, Instagram professional accounts, or other
          social media resources only after appropriate authorization.
        </p>
        <p>
          You represent that you have all rights and permissions necessary to connect and manage
          any account used with the Application.
        </p>
        <p>
          Authorization may be revoked through the relevant social media platform or through
          available Application controls.
        </p>
        <p>
          Revoking authorization may prevent future access or publishing but may not automatically
          delete previously stored information. Data deletion instructions are available at:{" "}
          <a href={`${PUBLIC_APPLICATION_ORIGIN}/data-deletion`}>
            {PUBLIC_APPLICATION_ORIGIN}/data-deletion
          </a>
        </p>
      </section>

      <section>
        <h2>6. Content and Intellectual Property</h2>
        <p>You retain any rights you hold in content uploaded to or created through the Application.</p>
        <p>
          By using the Application, you authorize NC Tile Pros LLC and its service providers to
          process, store, transmit, resize, format, and publish that content as necessary to
          provide the Application&apos;s functionality.
        </p>
        <p>
          You are responsible for ensuring that you have permission to use and publish all
          uploaded content, including photographs, videos, music, trademarks, written material,
          and images of identifiable people.
        </p>
        <p>
          The Application&apos;s source code, interface, design, branding, and original
          functionality remain the property of NC Tile Pros LLC or their respective licensors.
        </p>
      </section>

      <section>
        <h2>7. Third-Party Platforms and Services</h2>
        <p>The Application depends on third-party services, including Meta products and APIs.</p>
        <p>We do not control these third-party platforms and are not responsible for:</p>
        <ul>
          <li>Platform outages.</li>
          <li>API interruptions.</li>
          <li>Permission changes.</li>
          <li>Token expiration or revocation.</li>
          <li>Content moderation decisions.</li>
          <li>Account restrictions.</li>
          <li>Failed or delayed posts caused by a third-party service.</li>
          <li>Changes to third-party functionality, policies, or availability.</li>
        </ul>
        <p>Use of third-party services remains subject to their respective terms and policies.</p>
      </section>

      <section>
        <h2>8. Availability and Modifications</h2>
        <p>We may modify, suspend, restrict, or discontinue any part of the Application at any time.</p>
        <p>
          We do not guarantee that the Application will always be available, uninterrupted,
          secure, or error-free.
        </p>
        <p>
          Scheduled publishing should be reviewed periodically. Users remain responsible for
          confirming that time-sensitive content has been published successfully.
        </p>
      </section>

      <section>
        <h2>9. Security</h2>
        <p>
          You must not attempt to defeat, disable, probe, or interfere with the Application&apos;s
          security measures.
        </p>
        <p>
          Any suspected compromise of login credentials, access tokens, connected accounts, or
          production infrastructure should be reported promptly to:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>

      <section>
        <h2>10. Disclaimer of Warranties</h2>
        <p>
          To the fullest extent permitted by law, the Application is provided &ldquo;as is&rdquo;
          and &ldquo;as available.&rdquo;
        </p>
        <p>
          NC Tile Pros LLC disclaims all warranties, express or implied, including implied
          warranties of merchantability, fitness for a particular purpose, title, and
          non-infringement.
        </p>
        <p>
          We do not warrant that every scheduled post will publish at the requested time or that
          the Application will be compatible with every future change made by a third-party
          platform.
        </p>
      </section>

      <section>
        <h2>11. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, NC Tile Pros LLC will not be liable for indirect,
          incidental, special, consequential, exemplary, or punitive damages arising from or
          related to the Application.
        </p>
        <p>
          This includes loss of data, loss of content, publication errors, missed publishing
          times, account restrictions, service interruptions, lost revenue, or reputational harm.
        </p>
        <p>
          Nothing in these Terms excludes liability that cannot legally be excluded under
          applicable law.
        </p>
      </section>

      <section>
        <h2>12. Indemnification</h2>
        <p>
          To the extent permitted by law, an unauthorized user agrees to indemnify and hold
          harmless NC Tile Pros LLC from claims, damages, losses, and expenses arising from that
          user&apos;s misuse of the Application, violation of these Terms, infringement of
          third-party rights, or unauthorized management of a social media account.
        </p>
      </section>

      <section>
        <h2>13. Termination</h2>
        <p>
          NC Tile Pros LLC may suspend or terminate access to the Application at any time,
          particularly where access is unauthorized, creates a security risk, or violates these
          Terms or applicable platform requirements.
        </p>
        <p>
          Upon termination, authorization to access connected social media accounts may be
          revoked and stored credentials or tokens may be invalidated or deleted.
        </p>
      </section>

      <section>
        <h2>14. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of North Carolina, without regard to
          conflict-of-law principles.
        </p>
        <p>
          To the extent legally permitted, disputes relating to these Terms or the Application
          will be handled in an appropriate state or federal court located in North Carolina.
        </p>
      </section>

      <section>
        <h2>15. Changes to These Terms</h2>
        <p>
          We may update these Terms to reflect changes to the Application, applicable law, or
          third-party platform requirements.
        </p>
        <p>The effective date at the top of this page will be updated when changes are made.</p>
      </section>

      <section>
        <h2>16. Contact</h2>
        <p>Questions about these Terms may be directed to:</p>
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
