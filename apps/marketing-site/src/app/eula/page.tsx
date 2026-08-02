import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { COMPANY, LEGAL_LAST_UPDATED } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "End User License Agreement · Forest City Vault",
  description:
    "The terms that govern your use of the Forest City Vault website and services.",
};

export default function EulaPage() {
  return (
    <LegalPage
      title="End User License Agreement"
      intro={`These terms govern your use of the ${COMPANY.name} website and related services. Please read them carefully.`}
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <p>
        This End User License Agreement (&ldquo;Agreement&rdquo;) is a legal
        agreement between you and {COMPANY.name} (&ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;) governing your access to and use
        of our website, applications, and related services (collectively, the
        &ldquo;Service&rdquo;). By accessing or using the Service, you agree to
        be bound by this Agreement. If you do not agree, do not use the Service.
      </p>

      <h2>License</h2>
      <p>
        Subject to your compliance with this Agreement, we grant you a limited,
        non-exclusive, non-transferable, revocable license to access and use the
        Service for its intended purpose. We may modify, suspend, or discontinue
        any part of the Service at any time.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful or fraudulent purpose.</li>
        <li>
          Attempt to gain unauthorized access to the Service, its systems, or
          any related data.
        </li>
        <li>
          Interfere with or disrupt the integrity or performance of the Service.
        </li>
        <li>
          Copy, modify, reverse engineer, or create derivative works of the
          Service except as permitted by law.
        </li>
        <li>
          Submit false information or content that infringes the rights of
          others.
        </li>
      </ul>

      <h2>Submissions</h2>
      <p>
        If you submit information through the Service &mdash; such as a vendor
        application &mdash; you represent that it is accurate and that you have
        the right to share it. You grant us permission to use the information
        you submit to evaluate and respond to your request and to operate the
        Service. How we handle personal information is described in our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The Service, including its content, design, and trademarks, is owned by{" "}
        {COMPANY.name} or its licensors and is protected by applicable laws.
        Except for the limited license above, this Agreement does not grant you
        any rights in the Service.
      </p>

      <h2>Disclaimer of warranties</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; without warranties of any kind, whether express or
        implied, including implied warranties of merchantability, fitness for a
        particular purpose, and non-infringement. We do not warrant that the
        Service will be uninterrupted, error-free, or secure.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {COMPANY.name} will not be
        liable for any indirect, incidental, special, consequential, or punitive
        damages, or for any loss of profits, data, or goodwill, arising out of
        or related to your use of the Service. Our total liability for any claim
        relating to the Service will not exceed the amount you paid us, if any,
        for access to the Service.
      </p>

      <h2>Termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time,
        without notice, if you violate this Agreement or for any other reason.
        The sections of this Agreement that by their nature should survive
        termination will survive.
      </p>

      <h2>Governing law</h2>
      <p>
        This Agreement is governed by the laws of the State of{" "}
        {COMPANY.governingState}, {COMPANY.governingCountry}, without regard to
        its conflict-of-laws rules. Any disputes will be resolved in the courts
        located in {COMPANY.governingState}.
      </p>

      <h2>Changes to this Agreement</h2>
      <p>
        We may update this Agreement from time to time. When we do, we will
        revise the &ldquo;Last updated&rdquo; date above. Your continued use of
        the Service after an update means you accept the revised Agreement.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about this Agreement can be sent to{" "}
        <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a> or
        by mail at {COMPANY.name}, {COMPANY.address}.
      </p>
    </LegalPage>
  );
}
