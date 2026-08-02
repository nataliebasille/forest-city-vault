import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { MAP_URL } from "@/components/nav/nav";
import { COMPANY } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "Support · Forest City Vault",
  description:
    "Get help with Forest City Vault. Contact our team by email or visit us in Ohio City, Cleveland.",
};

export default function SupportPage() {
  return (
    <LegalPage
      eyebrow="Support"
      title="Support"
      intro={`Need a hand? Here's how to reach the ${COMPANY.name} team and get help.`}
    >
      <p>
        We're a small team running a curated consignment marketplace in Ohio
        City, Cleveland. Whether you're a customer, a vendor, or just have a
        question, we're happy to help.
      </p>

      <h2>Contact us</h2>
      <p>
        The fastest way to reach us is by email. We aim to respond within two
        business days.
      </p>
      <ul>
        <li>
          <strong>Email:</strong>{" "}
          <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>
        </li>
        <li>
          <strong>Visit the store:</strong>{" "}
          <a href={MAP_URL} target="_blank" rel="noreferrer">
            {COMPANY.address}
          </a>
        </li>
      </ul>

      <h2>Vendors</h2>
      <p>
        Interested in selling with us? Learn about the consignment split and
        apply on our <a href="/become-a-vendor">Become a vendor</a> page. If you
        already sell with us and need help with your shop, email us at{" "}
        <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>.
      </p>

      <h2>Privacy &amp; terms</h2>
      <p>
        For details on how we handle your information and the terms that govern
        our website and services, see our <a href="/privacy">Privacy Policy</a>{" "}
        and <a href="/eula">End User License Agreement</a>.
      </p>
    </LegalPage>
  );
}
