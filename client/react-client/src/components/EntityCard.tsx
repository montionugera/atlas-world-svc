import React from 'react';
import {
  CardContainer,
  Header,
  NameGroup,
  Avatar,
  Name,
  TypeBadge,
  Row,
  Label,
  Value,
  HealthBarContainer,
  HealthLabelRow,
  HealthTrack,
  HealthFill,
  Section,
  StatusGrid,
  StatusBadge,
  PlaceholderText,
  ResistanceSection,
  ResistanceGrid,
  SectionTitle,
  ActionGroup,
  ActionButton
} from './EntityCard.styles';

interface EntityCardProps {
  id: string;
  type: 'player' | 'mob';
  name?: string;
  x: number;
  y: number;
  health?: number;
  maxHealth?: number;
  isBot?: boolean;
  state?: string; // e.g. "idle", "attack"
  target?: string;
  avatarColor?: string;
  isCurrentPlayer?: boolean;
  isDead?: boolean;
  onToggleBot?: () => void;
  onAttack?: () => void;
  onForceDie?: () => void;
  onRespawn?: () => void;
  battleStatuses?: Map<string, number>;
  resistances?: Map<string, number>;
}

export const EntityCard: React.FC<EntityCardProps> = ({
  id,
  type,
  name,
  x,
  y,
  health,
  maxHealth,
  isBot,
  state,
  target,
  avatarColor,
  isCurrentPlayer,
  isDead,
  onToggleBot,
  onAttack,
  onForceDie,
  onRespawn,
  battleStatuses,
  resistances
}) => {
  const isPlayer = type === 'player';
  const bgColor = isPlayer ? '#2c3e50' : '#8e44ad';
  const borderColor = isPlayer ? (isCurrentPlayer ? '#f1c40f' : '#3498db') : '#9b59b6';

  // Badge Colors
  let badgeBg = 'rgba(155, 89, 182, 0.3)';
  let badgeCol = '#dda0dd';
  if (isCurrentPlayer) {
    badgeBg = '#f1c40f';
    badgeCol = '#2c3e50';
  } else if (isPlayer) {
    badgeBg = 'rgba(52, 152, 219, 0.3)';
    badgeCol = '#3498db';
  }

  return (
    <CardContainer $bgColor={bgColor} $borderColor={borderColor}>
      <Header>
        <NameGroup>
          {avatarColor && <Avatar $color={avatarColor} />}
          <Name>{name || (isPlayer ? 'Unknown Player' : 'Mob')}</Name>
        </NameGroup>
        <TypeBadge $bgColor={badgeBg} $color={badgeCol}>
          {isCurrentPlayer ? 'YOU' : type}
        </TypeBadge>
      </Header>

      <Row>
        <Label>ID</Label>
        <Value title={id}>{id.substring(0, 8)}...</Value>
      </Row>

      <Row>
        <Label>Position</Label>
        <Value>{x.toFixed(1)}, {y.toFixed(1)}</Value>
      </Row>

      {state && (
        <Row>
          <Label>State</Label>
          <Value style={{ color: state === 'attack' ? '#e74c3c' : '#bdc3c7' }}>
            {state.toUpperCase()}
          </Value>
        </Row>
      )}

      {target && (
        <Row>
          <Label>Target</Label>
          <Value>{target.substring(0, 8)}...</Value>
        </Row>
      )}

      {isBot !== undefined && !isCurrentPlayer && (
        <Row>
          <Label>Mode</Label>
          <Value style={{ color: isBot ? '#2ecc71' : '#95a5a6' }}>
            {isBot ? 'BOT' : 'MANUAL'}
          </Value>
        </Row>
      )}

      {health !== undefined && maxHealth !== undefined && (
        <HealthBarContainer>
          <HealthLabelRow>
            <Label>HP</Label>
            <Value>{Math.ceil(health)}/{maxHealth}</Value>
          </HealthLabelRow>
          <HealthTrack>
            <HealthFill 
              $percentage={(health / maxHealth) * 100} 
              $isLow={health < maxHealth * 0.3} 
            />
          </HealthTrack>
        </HealthBarContainer>
      )}

      {/* Status Effects Section - Always Visible */}
      <Section>
        <SectionTitle style={{ fontSize: '0.7rem', color: '#bdc3c7' }}>Status Effects</SectionTitle>
        <StatusGrid>
            {(!battleStatuses || battleStatuses.size === 0) ? (
                <PlaceholderText>- No Active Effects -</PlaceholderText>
            ) : (
                Array.from(battleStatuses.entries()).map(([type, expiry]) => {
                    const now = Date.now();
                    const msLeft = expiry - now;
                    // Force show even if expired (negative msLeft) for debugging/sync check
                    const isExpired = msLeft <= 0;
                    
                    return (
                        <StatusBadge key={type} $isExpired={isExpired}>
                            <span>
                                {type === 'freeze' ? '❄️' : 
                                 type === 'stun' ? '💫' : 
                                 type === 'fire' ? '🔥' : 
                                 type === 'entering' ? '⏳' : '✨'}
                            </span>
                            <span>{type.toUpperCase()} ({Math.round(msLeft/1000)}s)</span>
                        </StatusBadge>
                    );
                })
            )}
        </StatusGrid>
      </Section>

      {/* Resistances Display */}
      {resistances && resistances.size > 0 && (
          <ResistanceSection>
             <SectionTitle>Resistances</SectionTitle>
             <ResistanceGrid>
                 {Array.from(resistances.entries()).map(([type, value]) => (
                     <span key={type} title={`${type}: ${(value * 100).toFixed(0)}%`}>
                         {type === 'freeze' ? '❄️' : type === 'stun' ? '💫' : type === 'fire' ? '🔥' : '🛡️'} 
                         {Math.round(value * 100)}%
                     </span>
                 ))}
             </ResistanceGrid>
          </ResistanceSection>
      )}

      {/* Action Buttons for Current Player */}
      {isCurrentPlayer && (
          <ActionGroup>
              {onToggleBot && (
                  <ActionButton 
                    $variant="bot" 
                    $isActive={isBot} 
                    onClick={onToggleBot}
                  >
                      {isBot ? '🛑 Disable Bot' : '🤖 Enable Bot'}
                  </ActionButton>
              )}
              
              {onAttack && (
                  <ActionButton 
                    $variant="attack"
                    $isDisabled={isBot || isDead}
                    onClick={onAttack}
                  >
                      ⚔️ Attack
                  </ActionButton>
              )}

              {!isDead && onForceDie && (
                   <ActionButton 
                      $variant="die"
                      $isActive={false} // Kill me state (dark)
                      onClick={onForceDie}
                   >
                       💀 Kill Me
                   </ActionButton>
              )}
              
              {isDead && onRespawn && (
                  <ActionButton 
                      $variant="die"
                      $isActive={true} // Respawn state (green)
                      onClick={onRespawn}
                  >
                      ♻️ Respawn
                  </ActionButton>
              )}
          </ActionGroup>
      )}
    </CardContainer>
  );
};
