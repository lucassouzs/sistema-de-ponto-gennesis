export interface Employee {
  id: string;
  userId: string;
  employeeId: string; // Matrícula
  department: string;
  position: string;
  hireDate: string;
  birthDate?: string;
  salary: number;
  company?: string;
  polo?: string;
  costCenter?: string;
  client?: string;
  modality?: string;
  isRemote: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: 'EMPLOYEE' | 'ADMIN' | 'MANAGER';
  createdAt?: string;
  isActive?: boolean;
  employee?: Employee;
}