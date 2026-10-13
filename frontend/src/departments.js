// Single list of departments for the UI. Keep in sync with routing/departments.json.
export const DEPARTMENTS = [
  'Billing', 'Insurance', 'Scheduling', 'Pharmacy', 'Lab Reports',
  'Radiology', 'Clinical', 'Admin',
]

// Departments whose high-priority open items trigger the red urgent banner
export const URGENT_DEPARTMENTS = ['Clinical']

export const DEPT_BAR_COLOR = {
  Billing: 'bar-red', Insurance: 'bar-teal', Scheduling: 'bar-amber', Pharmacy: 'bar-blue',
  'Lab Reports': 'bar-green', Radiology: 'bar-slate', Clinical: 'bar-clinical',
  Admin: 'bar-gray',
}

// Daily appointment capacity shown on the appointment bar
export const APPOINTMENT_CAPACITY = 100
