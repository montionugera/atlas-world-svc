import styled from 'styled-components';

interface CardContainerProps {
  $bgColor: string;
  $borderColor: string;
}

export const CardContainer = styled.div<CardContainerProps>`
  background-color: ${props => props.$bgColor};
  color: #ecf0f1;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  border-left: 5px solid ${props => props.$borderColor};
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 250px;
  font-family: "Inter", sans-serif;
  position: relative;
  overflow: hidden;
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 8px;
`;

export const NameGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const Avatar = styled.div<{ $color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: ${props => props.$color};
`;

export const Name = styled.span`
  font-weight: 700;
  font-size: 1.1rem;
  color: #fff;
`;

interface TypeBadgeProps {
  $bgColor: string;
  $color: string;
}

export const TypeBadge = styled.span<TypeBadgeProps>`
  font-size: 0.7rem;
  padding: 4px 8px;
  border-radius: 12px;
  text-transform: uppercase;
  font-weight: bold;
  background-color: ${props => props.$bgColor};
  color: ${props => props.$color};
`;

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
`;

export const Label = styled.span`
  color: #bdc3c7;
`;

export const Value = styled.span`
  font-weight: 500;
  color: #ecf0f1;
`;

export const HealthBarContainer = styled.div`
  margin-top: 8px;
`;

export const HealthLabelRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  margin-bottom: 2px;
`;

export const HealthTrack = styled.div`
  width: 100%;
  height: 6px;
  background-color: rgba(0,0,0,0.3);
  border-radius: 3px;
  overflow: hidden;
`;

export const HealthFill = styled.div<{ $percentage: number; $isLow: boolean }>`
  width: ${props => props.$percentage}%;
  height: 100%;
  background-color: ${props => props.$isLow ? '#e74c3c' : '#2ecc71'};
  transition: width 0.3s ease;
`;

export const Section = styled.div`
  margin-top: 8px;
`;

export const StatusGrid = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

interface StatusBadgeProps {
  $isExpired: boolean;
}

export const StatusBadge = styled.div<StatusBadgeProps>`
  padding: 2px 6px;
  background-color: ${props => props.$isExpired ? 'rgba(231, 76, 60, 0.2)' : 'rgba(52, 152, 219, 0.2)'};
  border: 1px solid #3498db;
  border-radius: 4px;
  font-size: 0.7rem;
  color: ${props => props.$isExpired ? '#e74c3c' : '#3498db'};
  display: flex;
  align-items: center;
  gap: 2px;
`;

export const ResistanceGrid = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

export const ResistanceSection = styled.div`
  margin-top: 4px;
  font-size: 0.7rem;
  color: #95a5a6;
`;

export const SectionTitle = styled.div`
  margin-bottom: 2px;
  font-weight: bold;
`;

export const ActionGroup = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
`;

interface ButtonProps {
  $variant?: 'bot' | 'attack' | 'die' | 'default';
  $isActive?: boolean;
  $isDisabled?: boolean;
}

export const ActionButton = styled.button<ButtonProps>`
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  cursor: ${props => props.$isDisabled ? 'not-allowed' : 'pointer'};
  font-weight: 600;
  font-size: 0.8rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  
  /* Variant styles */
  ${props => {
    if (props.$variant === 'bot') {
      return `
        grid-column: 1 / -1;
        background-color: ${props.$isActive ? '#2ecc71' : '#e67e22'}; // Green if enabled (bot ON), Orange if disabled (bot OFF) - Wait, logic check. Usually green = active.
        // Logic in original: isBot ? '#e67e22' (Stop) : '#2ecc71' (Enable)
        // If isBot (Active) -> Orange (Stop)
        // If !isBot (Inactive) -> Green (Start)
        background-color: ${props.$isActive ? '#e67e22' : '#2ecc71'};
        color: white;
      `;
    }
    if (props.$variant === 'attack') {
      return `
        background-color: #e74c3c;
        color: white;
        opacity: ${props.$isDisabled ? 0.5 : 1};
      `;
    }
    if (props.$variant === 'die') {
      // isDead ? Respawn (Green) : Kill Me (Dark)
      return `
        background-color: ${props.$isActive ? '#2ecc71' : '#34495e'};
        color: ${props.$isActive ? 'white' : '#fab1a0'};
        border: ${props.$isActive ? 'none' : '1px solid #c0392b'};
      `;
    }
    return '';
  }}
`;

export const PlaceholderText = styled.span`
  color: #7f8c8d;
  font-style: italic;
  font-size: 0.7rem;
`;
