import React from 'react';

export default function WeekendCell({ slim }) {
  return (
    <div style={{
      minHeight: slim ? 36 : 80,
      borderRadius: 6,
      background: '#F8F7F2',
      border: '1px solid #EDECE6',
      opacity: 0.4,
    }} />
  );
}
