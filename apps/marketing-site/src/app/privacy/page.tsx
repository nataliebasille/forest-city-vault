import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { COMPANY, LEGAL_LAST_UPDATED } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "Privacy Policy · Forest City Vault",
  description:
    "How Forest City Vault collects, uses, and protects information from vendors, customers, and store transactions.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains how ${COMPANY.name} handles information collected through our website, our storefront, and the systems we use to run the shop.`}
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <p>
        {COMPANY.name} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;) operates a curated consignment marketplace in Ohio
        City, Cleveland, along with this website. We respect your privacy and
        collect only the information we need to run the store, support our
        vendors, and serve our customers. This policy describes what we collect,
        how we use it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <h3>Vendor applications</h3>
      <p>
        When you apply to become a vendor through our website, we collect the
        information you submit &mdash; such as your business or brand name,
        contact name, email address, phone number, website or social links, the
        categories you sell in, and any details you share about your work. We
        use this information solely to review your application and get in touch
        with you.
      </p>
      <h3>Store transactions</h3>
      <p>
        When a purchase is made at our storefront, our point-of-sale provider
        (Clover) processes the transaction. We receive and retain a record of
        the sale &mdash; such as the items sold, order details, discounts,
        payment amounts, payment types, and refunds &mdash; so we can operate
        the store, pay our consignment vendors accurately, and keep our own
        sales and accounting records. We do not store full payment card numbers;
        card processing is handled by our payment provider.
      </p>
      <h3>Website usage</h3>
      <p>
        Like most websites, our hosting and infrastructure providers may
        automatically log basic technical information (such as IP address,
        browser type, and pages requested) to keep the site secure and
        operational.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To review and respond to vendor applications.</li>
        <li>To operate the store, fulfill purchases, and process refunds.</li>
        <li>To calculate and pay consignment payouts to our vendors.</li>
        <li>
          To maintain our internal sales, reporting, and accounting records.
        </li>
        <li>To keep our website and systems secure and reliable.</li>
        <li>To comply with legal, tax, and accounting obligations.</li>
      </ul>

      <h2>How we share information</h2>
      <p>
        We do not sell your personal information. We share information only as
        needed to run the business, including with service providers who work on
        our behalf &mdash; for example our point-of-sale and payment provider
        (Clover), email and hosting providers, and professional advisors. These
        providers may only use the information to provide services to us. We may
        also disclose information when required by law or to protect our rights,
        safety, or property.
      </p>

      <h2>How we protect information</h2>
      <p>
        We use reasonable administrative and technical safeguards to protect the
        information we hold. Sensitive data, including any access credentials
        for the systems we integrate with, is encrypted at rest, and access is
        limited to the people and systems that need it. No method of storage or
        transmission is completely secure, but we work to protect your
        information appropriately.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep information for as long as needed for the purposes described in
        this policy, or as required for tax, accounting, and legal reasons. When
        information is no longer needed, we take steps to delete or de-identify
        it.
      </p>

      <h2>Your choices</h2>
      <p>
        You may contact us to ask what information we hold about you, to correct
        it, or to request deletion where we are not required to retain it.
        Depending on where you live, you may have additional rights under
        applicable privacy laws.
      </p>

      <h2>Children&rsquo;s privacy</h2>
      <p>
        Our website and services are intended for adults and are not directed to
        children. We do not knowingly collect personal information from
        children.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. When we do, we will revise
        the &ldquo;Last updated&rdquo; date above. Continued use of our website
        or services after an update means you accept the revised policy.
      </p>

      <h2>Contact us</h2>
      <p>
        If you have questions about this policy or your information, contact us
        at <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>{" "}
        or by mail at {COMPANY.name}, {COMPANY.address}.
      </p>
    </LegalPage>
  );
}
