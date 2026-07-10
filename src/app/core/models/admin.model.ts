export interface Admin {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  role: string;
  status: 'active' | 'suspended';
  lastLoginAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  admin: Admin;
}
