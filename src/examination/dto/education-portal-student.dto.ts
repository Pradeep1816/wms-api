export class EducationPortalStudentLocationDto {
  slug: string;
  name: string;
}

export class EducationPortalStudentDto {
  /** Added by the approved Student Number migration in a later slice. */
  studentNumber: null;
  displayName: string;
  homeLocation: EducationPortalStudentLocationDto;
  /** Eligibility rules are client-blocked and must not be inferred from lesson status. */
  registrationEligible: null;
}
