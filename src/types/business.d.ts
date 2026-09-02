export type BusinessTypePreset =
  | "food"
  | "hardware"
  | "store"
  | "cafe"
  | "bar"
  | "services"
  | "other";

export type DayHours =
  | { closed: true }
  | { closed: false; open: string; close: string };

export type BusinessHours = {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
};

export interface BusinessRegisterRequest {
  businessName: string;
  adminName: string;
  businessType: BusinessTypePreset;
  customBusinessType?: string;
  email: string;
  phone: string;
  hours: BusinessHours;
  password: string;
}

export interface BusinessRegisterResponse {
  message: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: "admin";
  };
  establishment: {
    id: string;
    name: string;
    category: string;
    phone: string;
    hours: BusinessHours;
  };
  redirectTo: "/admin/dashboard";
}
