
export function transformPath(path: string, locationSlug?: string): string {
 
  // Helper to get location - from path first, then fallback to locationSlug
  const getLocation = (pathLocation: string | undefined): string => {
    return (pathLocation || locationSlug) as string;
  };

  // Transform legacy user URL with role=customer: admin/{location}/user/view?UserSearch[role_name]=customer&id={id}
  const customerMatch = path.match(/\/admin(?:\/([^\/]+))?\/user\/view\?.*role_name.*=customer.*&id=(\d+)/);
  if (customerMatch) {
    const location = getLocation(customerMatch[1]);
    const customerId = customerMatch[2];
    return `/v2/admin/${location}/customers/${customerId}`;
  }

  // Transform legacy user URL with role=staffmember: admin/{location}/user/view?UserSearch[role_name]=staffmember&id={id}
  const staffMatch = path.match(/\/admin(?:\/([^\/]+))?\/user\/view\?.*role_name.*=staffmember.*&id=(\d+)/);
  if (staffMatch) {
    const location = getLocation(staffMatch[1]);
    const staffId = staffMatch[2];
    return `/v2/admin/${location}/staff-members/${staffId}`;
  }

  // Transform legacy user URL with role=owner: admin/{location}/user/view?UserSearch[role_name]=owner&id={id}
  const ownerMatch = path.match(/\/admin(?:\/([^\/]+))?\/user\/view\?.*role_name.*=owner.*&id=(\d+)/);
  if (ownerMatch) {
    const location = getLocation(ownerMatch[1]);
    const ownerId = ownerMatch[2];
    return `/v2/admin/${location}/owners/${ownerId}`;
  }

  // Transform legacy user URL with role=teacher: admin/{location}/user/view?UserSearch[role_name]=teacher&id={id}
  const teacherRoleMatch = path.match(/\/admin(?:\/([^\/]+))?\/user\/view\?.*role_name.*=teacher.*&id=(\d+)/);
  if (teacherRoleMatch) {
    const location = getLocation(teacherRoleMatch[1]);
    const teacherId = teacherRoleMatch[2];
    return `/v2/admin/${location}/teachers/${teacherId}`;
  }

  // Transform legacy teacher URL (no role specified): admin/{location}/user/view?id={id}
  const teacherMatch = path.match(/\/admin(?:\/([^\/]+))?\/user\/view\?id=(\d+)/);
  if (teacherMatch) {
    const location = getLocation(teacherMatch[1]);
    const teacherId = teacherMatch[2];
    return `/v2/admin/${location}/teachers/${teacherId}`;
  }

  // Transform legacy student URL: admin/{location}/student/view?id={id}
  const studentMatch = path.match(/\/admin(?:\/([^\/]+))?\/student\/view\?id=(\d+)/);
  if (studentMatch) {
    const location = getLocation(studentMatch[1]);
    const studentId = studentMatch[2];
    return `/v2/admin/${location}/students/${studentId}`;
  }

  // Transform legacy enrolment URL: admin/{location}/enrolment/view?id={id}
  const enrolmentMatch = path.match(/\/admin(?:\/([^\/]+))?\/enrolment\/view\?id=(\d+)/);
  if (enrolmentMatch) {
    const location = getLocation(enrolmentMatch[1]);
    const enrolmentId = enrolmentMatch[2];
    return `/v2/admin/${location}/enrolments/${enrolmentId}`;
  }





  // Transform legacy invoice URL: admin/{location}/invoice/view?id={id}
  const invoiceMatch = path.match(/\/admin(?:\/([^\/]+))?\/invoice\/view\?id=(\d+)/);
  if (invoiceMatch) {
    const location = getLocation(invoiceMatch[1]);
    const invoiceId = invoiceMatch[2];
    return `/v2/admin/${location}/invoices/${invoiceId}`;
  }



  // Return original if no transformation matched
  return path;
}
