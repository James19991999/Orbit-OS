/** Starter control sets. They're a tracking aid, not legal advice or a certification. */
export interface FrameworkTemplate { key: 'soc2' | 'gdpr' | 'iso27001' | 'hipaa'; name: string; description: string; controls: [string, string][] }

export const FRAMEWORK_TEMPLATES: FrameworkTemplate[] = [
  {
    key: 'soc2', name: 'SOC 2 Type II', description: 'AICPA Trust Services Criteria — security, availability, confidentiality',
    controls: [
      ['CC1.1', 'Code of conduct acknowledged by all personnel'], ['CC1.4', 'Background checks for new hires'],
      ['CC2.1', 'Security policies published and reviewed annually'], ['CC3.1', 'Annual risk assessment performed'],
      ['CC4.1', 'Internal control monitoring performed quarterly'], ['CC5.2', 'Change management procedure documented'],
      ['CC6.1', 'Logical access provisioned on least privilege'], ['CC6.2', 'Access reviews performed quarterly'],
      ['CC6.3', 'Access removed within 24h of offboarding'], ['CC6.6', 'MFA enforced for production and admin access'],
      ['CC6.7', 'Data encrypted in transit (TLS 1.2+)'], ['CC6.8', 'Endpoint protection on company devices'],
      ['CC7.1', 'Vulnerability scanning performed monthly'], ['CC7.2', 'Security events logged and monitored'],
      ['CC7.3', 'Incident response plan tested annually'], ['CC7.4', 'Incidents tracked to resolution'],
      ['CC8.1', 'Production changes peer-reviewed'], ['CC9.1', 'Business continuity plan documented'],
      ['CC9.2', 'Vendor risk assessments performed'], ['A1.2', 'Backups performed daily and restore-tested'],
    ],
  },
  {
    key: 'gdpr', name: 'GDPR (EU & UK)', description: 'General Data Protection Regulation',
    controls: [
      ['Art.5', 'Processing principles documented'], ['Art.6', 'Lawful basis recorded for each processing activity'],
      ['Art.7', 'Consent records retained'], ['Art.12', 'Privacy notice published and current'],
      ['Art.15', 'Data subject access requests answered within 30 days'], ['Art.17', 'Erasure requests honoured'],
      ['Art.25', 'Privacy by design in product reviews'], ['Art.28', 'Data processing agreements with processors'],
      ['Art.30', 'Record of processing activities maintained'], ['Art.32', 'Appropriate technical security measures'],
      ['Art.33', 'Breach notification procedure (72h)'], ['Art.35', 'DPIAs for high-risk processing'],
      ['Art.44', 'International transfer safeguards (SCCs)'],
    ],
  },
  {
    key: 'iso27001', name: 'ISO/IEC 27001:2022', description: 'Information security management system (Annex A)',
    controls: [
      ['A.5.1', 'Information security policies'], ['A.5.9', 'Inventory of information assets'], ['A.5.15', 'Access control policy'],
      ['A.5.19', 'Supplier relationship security'], ['A.5.23', 'Cloud services security'], ['A.5.24', 'Incident management planning'],
      ['A.5.29', 'Security during disruption'], ['A.5.34', 'Privacy and protection of PII'], ['A.6.1', 'Personnel screening'],
      ['A.6.3', 'Security awareness training'], ['A.6.7', 'Remote working security'], ['A.7.9', 'Security of off-premises assets'],
      ['A.8.1', 'User endpoint devices protected'], ['A.8.5', 'Secure authentication'], ['A.8.7', 'Protection against malware'],
      ['A.8.8', 'Technical vulnerability management'], ['A.8.13', 'Information backup'], ['A.8.15', 'Logging'],
      ['A.8.24', 'Use of cryptography'], ['A.8.28', 'Secure coding'],
    ],
  },
  {
    key: 'hipaa', name: 'HIPAA Security Rule', description: 'Safeguards for electronic protected health information',
    controls: [
      ['164.308(a)(1)', 'Security management process & risk analysis'], ['164.308(a)(3)', 'Workforce security'],
      ['164.308(a)(5)', 'Security awareness and training'], ['164.308(a)(6)', 'Security incident procedures'],
      ['164.308(a)(7)', 'Contingency plan'], ['164.308(b)(1)', 'Business associate agreements'],
      ['164.310(d)(1)', 'Device and media controls'], ['164.312(a)(1)', 'Access control & unique user IDs'],
      ['164.312(b)', 'Audit controls'], ['164.312(e)(1)', 'Transmission security'],
    ],
  },
];
