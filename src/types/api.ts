// API Response Types

export interface SuccessResponse<T> {
  status: "success";
  data: T;
}

export interface ErrorResponse {
  status: "error";
  message: string;
  code?: number;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

// Auth Types

export interface RegisterRequestBody {
  email: string;
  password: string;
}

export interface RegisterSuccessData {
  token: string;
  user: {
    id: number;
    email: string;
  };
}

export type RegisterResponse = SuccessResponse<RegisterSuccessData> | ErrorResponse;

export interface LoginRequestBody {
  email: string;
  password: string;
}

export interface LoginSuccessData {
  token: string;
  user: {
    id: number;
    email: string;
  };
}

export type LoginResponse = SuccessResponse<LoginSuccessData> | ErrorResponse;
