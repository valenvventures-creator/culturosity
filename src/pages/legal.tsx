import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useConfig } from "../lib/session";
import { useDocumentTitle } from "../components/ui";

const EFFECTIVE_DATE = "November 18, 2026";

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="container page">
      <article className="legal-doc">
        <div className="eyebrow">Legal</div>
        <h1>{title}</h1>
        <p className="muted legal-date">Effective and last updated: {EFFECTIVE_DATE}</p>
        {children}
      </article>
    </div>
  );
}

function ContactEmail() {
  const { data: cfg } = useConfig();
  const email = cfg?.contactEmail ?? "hello@culturosity.io";
  return <a href={`mailto:${email}`}>{email}</a>;
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        At Culturosity, we value your privacy and are committed to protecting your personal information. This Privacy Policy outlines how we
        collect, use, disclose, and protect the information you provide when using our Culturosity application ("Application"). By accessing or
        using our Application, you agree to the terms and conditions of this policy.
      </p>

      <h2>Information We Collect</h2>
      <h3>Personal Information</h3>
      <p>
        When you create an account on the Culturosity Application, we may collect your name, email address, contact information, and other relevant
        details. If you choose to provide additional information, we may collect that as well.
      </p>
      <ul>
        <li>Any personal information voluntarily disclosed in your account will be collected and stored by us.</li>
      </ul>
      <h3>Usage Information</h3>
      <ul>
        <li>
          When you use the Culturosity Application, we may collect usage information, including but not limited to your interactions with the
          Application, preferences, and settings.
        </li>
      </ul>
      <h3>Device Information</h3>
      <ul>
        <li>We may collect information about your device, such as your device type, operating system, and unique device identifiers.</li>
      </ul>

      <h2>Use of Collected Information</h2>
      <h3>Personal Information</h3>
      <p>We primarily use your personal information to provide and improve our services, personalize your experience, and communicate with you.</p>
      <ul>
        <li>
          We may use your email address to send you relevant notifications, updates, marketing materials, and other information related to our
          services. You can opt out of receiving these communications at any time.
        </li>
      </ul>
      <h3>Usage Information</h3>
      <ul>
        <li>We may use the usage information to analyze trends, improve the functionality and performance of the Application, and enhance your user experience.</li>
      </ul>
      <h3>Device Information</h3>
      <ul>
        <li>We may use device information to ensure the compatibility of the Application with your device and to optimize its performance.</li>
      </ul>

      <h2>Information Sharing and Disclosure</h2>
      <h3>Third-Party Service Providers</h3>
      <p>
        We may share your personal information with trusted third-party service providers who assist us in delivering our services, such as
        hosting, data analysis, customer support, and marketing.
      </p>
      <ul>
        <li>
          These service providers are contractually obligated to maintain the confidentiality and security of your information and are prohibited
          from using it for any other purpose.
        </li>
      </ul>
      <h3>Legal Compliance</h3>
      <p>
        We may disclose your personal information if required to do so by law or in response to valid requests from government authorities,
        including to meet national security or law enforcement requirements.
      </p>
      <ul>
        <li>
          We may also disclose your information to protect our rights, investigate fraud or security incidents, or enforce our{" "}
          <Link to="/terms">Terms of Use</Link>.
        </li>
      </ul>

      <h2>Data Security</h2>
      <p>We implement reasonable security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction.</p>
      <p>However, please note that no method of transmission or electronic storage is 100% secure, and we cannot guarantee absolute security.</p>

      <h2>Your Rights and Choices</h2>
      <p>You have the right to access, correct, update, or delete your personal information by accessing your account settings or contacting us directly.</p>

      <h2>Children's Privacy</h2>
      <p>
        The Culturosity Application is not directed to individuals under the age of 14. We do not knowingly collect personal information from
        children. If you become aware that your child has provided us with personal information, please contact us, and we will promptly delete
        such information.
      </p>

      <h2>Changes to this Privacy Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Any changes will be posted on this page. We encourage you to review this Privacy
        Policy periodically to stay informed about how we collect, use, and protect your personal information.
      </p>
      <p>By continuing to use the Culturosity Application after any changes to this Privacy Policy, you acknowledge and agree to the updated terms.</p>

      <h2>Contact Us</h2>
      <p>
        If you have any questions about this Privacy Policy, please contact us at <ContactEmail />.
      </p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <h2>Introduction</h2>
      <p>
        Welcome to the Culturosity mobile application (the "Platform"). These Terms and Conditions ("Terms") govern your use of the Platform and
        outline the rights, responsibilities, and obligations between Culturosity ("we," "us," or "our") and users ("you" or "your") of the
        Platform. By accessing or using the Platform, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use
        the Platform.
      </p>

      <h2>Purpose and Scope</h2>
      <p>
        These Terms outline the terms of service for the Culturosity mobile application. By using the Platform, users agree to adhere to these
        Terms. The Terms outline the user's responsibilities, prohibited activities, and guidelines for using the Platform.
      </p>

      <h2>Key Terms</h2>
      <p>Throughout the document, certain terms have specific meanings. The key terms used in this document are defined as follows:</p>
      <ul>
        <li><strong>Platform:</strong> refers to the Culturosity mobile application, including its features, services, and functionalities.</li>
        <li><strong>User:</strong> refers to any individual who accesses or uses the Culturosity mobile application.</li>
        <li><strong>User-generated content:</strong> refers to any content submitted or posted by the user on the Platform.</li>
        <li><strong>Perks:</strong> refers to the benefits and offerings provided by participating businesses and organizations.</li>
      </ul>

      <h2>Acceptance of Terms</h2>
      <p>
        By using the Platform, you agree to be bound by these Terms. You must be at least 14 years old to use the Platform. By using the Platform,
        you confirm that you have the legal capacity to accept these Terms. If you do not accept these Terms, you are not permitted to use the
        Platform.
      </p>

      <h2>User Accounts</h2>
      <p>
        To access the Platform, users must create an account. Users must provide accurate and complete information during the registration
        process. Users are responsible for maintaining the confidentiality of their account information and are liable for any activity that
        occurs under their account. Users are prohibited from creating multiple accounts or impersonating others. Users retain ownership of their
        user-generated content. By submitting content on the Platform, users grant Culturosity a non-exclusive, transferable, sub-licensable,
        royalty-free, worldwide license to use, reproduce, modify, adapt, publish, and display such content for the purposes of operating and
        improving the Platform.
      </p>

      <h2>Platform Usage</h2>
      <p>
        Users are permitted to use the Platform in compliance with applicable laws and regulations. Users must not engage in spam, malware, or any
        other harmful activities. Users must respect intellectual property rights and not post content that infringes on those rights. The
        Platform is designed to provide perks from participating businesses and organizations that took our Diversity, Equity, and Inclusivity
        pledge. Users may only use the Platform for legitimate purposes related to promoting the culture, heritage, and diversity of participating
        cities and regions. Culturosity is not responsible for any content posted on the Platform.
      </p>

      <h2>Perks and Participating Businesses</h2>
      <p>
        Culturosity provides perks from participating businesses and organizations that have taken our Diversity, Equity, and Inclusivity pledge.
        The availability of perks and participating businesses may vary. Culturosity strives to provide accurate and up-to-date information on the
        Platform but does not guarantee the availability or accuracy of perks or participating businesses. Culturosity reserves the right to modify
        or remove perks or participating businesses without prior notice.
      </p>

      <h2>Ownership and Responsibility</h2>
      <p>
        By providing or posting any content for use on the Platform, you represent and warrant that you have the necessary permissions, authority,
        and/or rights to publish such content.
      </p>

      <h2>User Conduct and Content</h2>
      <p>
        Users are prohibited from posting any content that is illegal, offensive, defamatory, discriminatory, or in violation of these Terms. Users
        are responsible for the content they submit and must ensure its accuracy and appropriateness. Culturosity reserves the right to moderate,
        edit, and remove any content that violates these Terms.
      </p>

      <h2>Privacy and Data Protection</h2>
      <p>
        By using the Platform, users agree to our <Link to="/privacy">Privacy Policy</Link>. Culturosity collects and uses personal information in
        accordance with our Privacy Policy. We may share information with third parties to provide enhanced services or promotional offers.
      </p>

      <h2>Use of Information</h2>
      <p>
        By using the Platform, you agree that we may collect, use, store, and process your personal information in accordance with our Privacy
        Policy. You acknowledge that your personal information may be used for various purposes, including but not limited to providing you with
        access to the Platform, improving our services, and contacting you regarding updates or promotions.
      </p>

      <h2>Sharing with Partners</h2>
      <p>
        You agree that we may share your information, including personal information, with our partners, affiliates, or third parties for the
        purpose of providing you with enhanced services or promotional offers. We will handle your information in accordance with our Privacy
        Policy.
      </p>

      <h2>Dispute Resolution</h2>
      <p>
        Any disputes arising from the use of the Platform shall be resolved in accordance with the dispute resolution procedures outlined in these
        Terms. Users agree to the jurisdiction and governing law of these Terms.
      </p>

      <h2>Limitation of Liability and Disclaimer</h2>
      <p>
        Culturosity provides the Platform on an "as is" and "as available" basis. While we strive to ensure the accuracy and reliability of the
        Platform, we do not guarantee its completeness, reliability, or availability at all times. Users acknowledge that the use of the Platform is
        at their own risk. Culturosity shall not be liable for any damages, direct or indirect, arising from the use or inability to use the
        Platform. Culturosity disclaims all warranties, whether express or implied, including but not limited to warranties of merchantability,
        fitness for a particular purpose, and non-infringement.
      </p>

      <h2>Termination</h2>
      <p>
        Culturosity reserves the right to terminate or suspend user accounts or the entire Platform, with or without prior notice, for any reason,
        including but not limited to a violation of these Terms. Upon termination, users may lose access to their accounts and any associated data.
        Users understand and agree that Culturosity shall not be liable for any consequences resulting from the termination of accounts or the
        Platform.
      </p>

      <h2>Updates and Modifications</h2>
      <p>
        Culturosity may update or modify these Terms at any time without prior notice. Users are responsible for regularly reviewing the Terms to
        stay informed of any changes. By continuing to use the Platform after modifications to the Terms have been made, users accept and agree to
        be bound by the updated Terms.
      </p>

      <h2>Miscellaneous</h2>
      <p>
        If any provision of these Terms is found to be unenforceable or invalid, the remaining provisions shall continue to be valid and enforceable
        to the fullest extent permitted by law. These Terms constitute the entire agreement between users and Culturosity regarding the use of the
        Platform and supersede any prior agreements. The failure of Culturosity to exercise or enforce any right or provision of these Terms shall
        not constitute a waiver of such right or provision.
      </p>

      <h2>Contact Information</h2>
      <p>
        If you have any questions or inquiries regarding these Terms, please contact us at <ContactEmail />.
      </p>

      <h2>General</h2>
      <p>By using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.</p>
    </LegalPage>
  );
}
