import React from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

export type CalendarProps = {
  value: Date;
  onChange: (date: Date) => void;
};

export default function DatePickerCalendar({ value, onChange }: CalendarProps) {
  return (
    <div className="mb-6">
      <Calendar
        onChange={date => onChange(date as Date)}
        value={value}
        locale="pt-BR"
      />
    </div>
  );
}
