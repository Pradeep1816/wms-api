import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed of the policy text that was previously hardcoded in the customer-facing
 * enrolment form (smw-web .../enroll/[location]/[token]/page.tsx).
 */
const seedPolicies: Array<{ title: string; content: string }> = [
  {
    title: 'A.  ARCADIA ACADEMY OF MUSIC POLICIES:',
    content: [
      "1.  Cancellation Policy: Arcadia must be notified by no later than 8:00pm on the day prior to a scheduled lesson. Doctor's note is required, in all other situations. Failure to provide a doctor’s note will result in the loss of the lesson for that day. If a student cancels more than once in a month, those lessons will be lost unless a doctor's note is provided.",
      '2.  Missed Lessons Policy: Missed lessons must be booked within one month and must be completed within a three (3) month period. If these lessons are not booked, and completed within the allotted time, these lessons are considered null and void.',
      '3.  Cancelled Missed Lessons Policy: Cancelled missed lessons will not be rescheduled.',
      '4.  Inclement Weather Policy: In severe weather conditions, Arcadia will make the decision of whether to cancel all lessons (or move lessons online) and close the school for the day. Parents are to call the school to find out if their child has a scheduled lesson.',
      '5.  Calendar Policy: An Arcadia calendar comprises 48 weeks which equates to four (4) lessons per month. The fifth lesson is titled a Professional Development Day (PDD), which will occur four (4) times yearly. No regular lessons will be conducted on Professional Development days.',
      '6.  Holidays Policy: A substitute lesson will be given for missed lessons that fall on holidays such as Family Day, Good Friday, Christmas Day, and New Years Day. Such lessons will be made up within a month of the holiday.',
      '7.  Special Promotions: Missed lessons, due to parent/student cancellation, during a promotion or gift certificate scenario will not be made up.',
      '8.  Termination of Lessons Policy: Clients must advise Arcadia in writing, two weeks before the last day of the committed month, of any request to discontinue further lessons. Otherwise, the obligation of fees due on the 1st of the month remains the same.',
      '9.  Online Lessons Policy: Your in-class lessons may be changed to online due to one of the following: inclement weather, student/instructor not available for in-class lessons, makeup lessons, pandemic lockdown etc., at our request.',
    ].join('\n'),
  },
  {
    title: 'B.  ARCADIA ACADEMY OF MUSIC AGREES TO:',
    content: [
      '1.  Reserve teaching facilities for scheduled times based on the Arcadia calendar.',
      '2.  Teach the enrolled student in accordance with grade standards.',
      '3.  Encourage student participation in Arcadia Academy of Music sponsored events.',
      '4.  Find another qualified instructor as a substitute in the absence of an instructor due to illness or otherwise.',
      '5.  Provide an extra lesson if adequate notice of a cancelled lesson is not provided, or a substitute instructor is unavailable.',
    ].join('\n'),
  },
  {
    title: 'C.  LESSON RATE AND PAYMENT OPTIONS:',
    content: [
      '1.  Commitment Rate: The applicable commitment rate is determined by the program/instrument and lesson duration selected. The exact rate for this enrollment will be confirmed in the enrollment package provided by Arcadia Academy of Music, and will be paid based on the payment option disclosed in the enrollment form.',
      '2.  NSF/Declined Policy: A $25.00 service charge will be applied to any NSF cheque or any declined pre-authorized credit card/debit payment.',
      '3.  Monthly Payments:  Parents\\Client who choose to pay monthly will be subject to automatic renewal unless parents\\clients provide ample notice of termination of lessons.',
      'See Termination of Lessons Policy. These monthly payments must be accompanied with 12 post-dated cheques or pre-authorized credit card/debit payments',
      '4.  Full Year in Advance Payment: Payment for one full year in advance, will receive a 10% discount.',
      '5.  Six Months in Advance Payment: Payment for six months in advance, will receive a 6% discount.',
      '6.  Three Months in Advance Payment: Payment for three months in advance, will receive a 3% discount.',
      '7.  Family discounts are available. Please inquire at the front desk for more information.',
      '8.  All Fees are subject to change and are non-refundable.',
    ].join('\n'),
  },
  {
    title: 'Automatic Pre-Authorized Payment Authorization:',
    content: [
      'By selecting any of the payment options outlined under the LESSON RATE AND PAYMENT OPTIONS section and providing pre-authorized credit card or debit payment information, the Parent/Client authorizes Arcadia Academy of Music to process payments automatically in accordance with the selected payment plan without further notice, reminder, or approval prior to each transaction.',
      "It is the responsibility of the Parent/Client to provide written notice of any cancellation or termination of lessons in accordance with Arcadia Academy of Music's Termination of Lessons Policy. Failure to provide the required two (2) weeks' written notice prior to the end of the committed month will result in the next scheduled payment being processed and the obligation for fees remaining in effect.",
      'The Parent/Client acknowledges and agrees that Arcadia Academy of Music is not responsible for providing payment reminders or renewal notices prior to processing scheduled payments under any pre-authorized payment arrangement.',
    ].join('\n\n'),
  },
  {
    title: 'VIDEO CONSENT AND AGREEMENT:',
    content: [
      'As an Arcadia client, I consent to the delivery of music lessons and/or e-learning programs used by any Arcadia location and their Instructors to myself and/or the student as  the case may be via third party tele-conferencing apps (i.e. Skype, Zoom) as may be prescribed by Arcadia from time to time (“Online Lessons”) to the video recording of myself and/or my students for teaching  purposes only.',
      'WE DO NOT SELL OR DISTRIBUTE YOUR PERSONAL INFORMATION TO ANY THIRD PARTY.',
    ].join('\n\n'),
  },
];

export class CreateEnrolmentPolicies1782960000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE enrolment_policy (
        id int unsigned NOT NULL AUTO_INCREMENT,
        title varchar(255) NOT NULL,
        content longtext NOT NULL,
        sortOrder int NOT NULL DEFAULT 0,
        isActive tinyint(1) NOT NULL DEFAULT 1,
        createdByUserId int NULL,
        updatedByUserId int NULL,
        -- No DEFAULT/ON UPDATE CURRENT_TIMESTAMP on purpose. The MySQL session
        -- time_zone is US/Eastern, so CURRENT_TIMESTAMP would write an Eastern
        -- wall clock, which the driver (timezone: 'Z') would then read back as
        -- UTC -- a silent 4/5 hour error. Timestamps are always written by the
        -- app as UTC (new Date()), or as UTC_TIMESTAMP() in the seed below.
        createdOn timestamp NULL DEFAULT NULL,
        updatedOn timestamp NULL DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_ep_sort_order (sortOrder),
        KEY idx_ep_created_by (createdByUserId),
        KEY idx_ep_updated_by (updatedByUserId),
        CONSTRAINT fk_ep_created_by FOREIGN KEY (createdByUserId) REFERENCES user (id),
        CONSTRAINT fk_ep_updated_by FOREIGN KEY (updatedByUserId) REFERENCES user (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Point-in-time copy of the policy the customer agreed to, so later edits to
    // enrolment_policy cannot rewrite what was actually signed.
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ADD COLUMN policySnapshot longtext NULL AFTER policyAcknowledgementData
    `);

    // UTC_TIMESTAMP() rather than CURRENT_TIMESTAMP so the seeded audit times do
    // not depend on the session time zone. Seeded rows have no author, so the
    // created/updated user ids stay NULL and render as "System".
    for (const [index, policy] of seedPolicies.entries()) {
      await queryRunner.query(
        `INSERT INTO enrolment_policy
           (title, content, sortOrder, isActive, createdByUserId, updatedByUserId, createdOn, updatedOn)
         VALUES (?, ?, ?, 1, NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [policy.title, policy.content, index],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        DROP COLUMN policySnapshot
    `);

    await queryRunner.query('DROP TABLE enrolment_policy');
  }
}
