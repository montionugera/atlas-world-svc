/**
 * MobDataTable Component Tests
 * Tests the hybrid real-time + metadata fetching approach
 * Parameterized for both vendor and tenant contract types
 */

import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MobDataTable } from '../MobDataTable'
import { gameDataManager } from '../../utils/gameDataManager'
import { useGameStateContext } from '../../contexts/GameStateContext'
import { GameState } from '../../types/game'

// Mock dependencies
jest.mock('../../utils/gameDataManager')
jest.mock('../../contexts/GameStateContext')

const mockGameDataManager = gameDataManager as jest.Mocked<typeof gameDataManager>
const mockUseGameStateContext = useGameStateContext as jest.MockedFunction<typeof useGameStateContext>

describe('MobDataTable - All Contract Types', () => {
  const contractTypes: Array<'vendor' | 'tenant'> = ['vendor', 'tenant']

  // Run tests for both vendor and tenant contract types
  contractTypes.forEach(contractType => {
    describe(`${contractType} contracts`, () => {
      const mockMobMetadata: any = {
        id: `${contractType}-mob-1`,
        mobTypeId: contractType === 'vendor' ? 'spear_thrower' : 'basic_mob',
        radius: 5,
        maxHealth: 100,
        currentHealth: 75,
        isAlive: true,
        attackDamage: 20,
        attackRange: 10,
        attackDelay: 1000,
        defense: 5,
        armor: 2,
        density: 1,
        maxMoveSpeed: 20,
        currentBehavior: 'chase',
        tag: 'chase',
        behaviorLockedUntil: 0,
        isCasting: false,
        isAttacking: false,
        lastAttackedTarget: ''
      }

      const mockGameStateMob = {
        id: `${contractType}-mob-1`,
        x: 50,
        y: 50,
        vx: 1,
        vy: 1,
        radius: 5,
        tag: 'attack',
        currentHealth: 60,
        isAlive: true,
        currentBehavior: 'attack',
        isCasting: true,
        isAttacking: true
      }

      beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
        
        mockUseGameStateContext.mockReturnValue({
          gameState: null,
          roomId: null,
          isConnected: false,
          setGameState: jest.fn()
        })
      })

      afterEach(() => {
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
      })

      describe('Connection States', () => {
        it(`renders "Not connected" when no roomId or gameState for ${contractType}`, () => {
          render(<MobDataTable roomId={null} />)
          expect(screen.getByText('Not connected to a room')).toBeInTheDocument()
        })

        it(`renders ${contractType} mobs when roomId is provided`, async () => {
          mockGameDataManager.getRoomMobs.mockResolvedValue([mockMobMetadata])
          
          render(<MobDataTable roomId={`room-${contractType}-123`} />)
          
          await waitFor(() => {
            expect(screen.getByText(/Mobs \(1\)/)).toBeInTheDocument()
          })
        })
      })

      describe('Metadata Fetching', () => {
        it(`fetches ${contractType} metadata on mount when roomId is available`, async () => {
          mockGameDataManager.getRoomMobs.mockResolvedValue([mockMobMetadata])
          
          render(<MobDataTable roomId={`room-${contractType}-123`} />)
          
          await waitFor(() => {
            expect(mockGameDataManager.getRoomMobs).toHaveBeenCalledWith(`room-${contractType}-123`, true)
          })
        })

        it(`fetches ${contractType} metadata for new mobs when they appear in gameState`, async () => {
          const gameState: GameState = {
            players: new Map(),
            mobs: new Map([[`${contractType}-mob-1`, mockGameStateMob as any]]),
            tick: 0,
            mapId: 'map-01',
            width: 400,
            height: 300
          }
          
          mockUseGameStateContext.mockReturnValue({
            gameState,
            roomId: `room-${contractType}-123`,
            isConnected: true,
            setGameState: jest.fn()
          })
          mockGameDataManager.getRoomMobs.mockResolvedValue([mockMobMetadata])
          
          render(<MobDataTable roomId={`room-${contractType}-123`} gameState={gameState} />)
          
          await waitFor(() => {
            expect(mockGameDataManager.getRoomMobs).toHaveBeenCalled()
            expect(screen.getByText(/Mobs \(1\)/)).toBeInTheDocument()
          })
        })
      })

      describe('Data Merging', () => {
        it(`merges ${contractType} gameState real-time data with metadata`, async () => {
          const gameState: GameState = {
            players: new Map(),
            mobs: new Map([[`${contractType}-mob-1`, mockGameStateMob as any]]),
            tick: 0,
            mapId: 'map-01',
            width: 400,
            height: 300
          }
          
          mockUseGameStateContext.mockReturnValue({
            gameState,
            roomId: `room-${contractType}-123`,
            isConnected: true,
            setGameState: jest.fn()
          })
          mockGameDataManager.getRoomMobs.mockResolvedValue([mockMobMetadata])
          
          render(<MobDataTable roomId={`room-${contractType}-123`} gameState={gameState} />)
          
          await waitFor(() => {
            expect(screen.getByText(/60\/100/)).toBeInTheDocument()
            expect(screen.getByText('attack')).toBeInTheDocument()
          })
        })
      })

      describe('UI Interactions', () => {
        it(`allows selecting a ${contractType} mob to view details`, async () => {
          mockGameDataManager.getRoomMobs.mockResolvedValue([mockMobMetadata])
          
          render(<MobDataTable roomId={`room-${contractType}-123`} />)
          
          await waitFor(() => {
            expect(screen.getByText(new RegExp(`${contractType}-mob-1`))).toBeInTheDocument()
          })
          
          const mobRow = screen.getByText(new RegExp(`${contractType}-mob-1`)).closest('tr')
          act(() => {
            mobRow?.click()
          })
          
          await waitFor(() => {
            expect(screen.getByText(new RegExp(`Mob Details: ${contractType}-mob-1`))).toBeInTheDocument()
          })
        })
      })
    })
  })
})
