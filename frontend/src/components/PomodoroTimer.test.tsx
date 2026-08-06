import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { PomodoroTimer } from './PomodoroTimer'

describe('PomodoroTimer Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  it('debe requerir una tarea activa para iniciar y mostrar un cartel de advertencia', async () => {
    // Mock fetch to return empty tasks list
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ results: { bindings: [] }, success: true }),
    })
    global.fetch = mockFetch

    render(<PomodoroTimer showCloseButton={false} />)

    // Click "Iniciar"
    const startButton = screen.getByText('Iniciar')
    fireEvent.click(startButton)

    // Check if the warning banner is displayed
    const warning = await screen.findByText(/Debes seleccionar una tarea activa/i)
    expect(warning).toBeInTheDocument()
  })

  it('debe permitir iniciar el temporizador si hay una tarea seleccionada', async () => {
    const mockTask = {
      task: { value: 'http://cientopolis.org/rfu/task/1' },
      title: { value: 'Test Task' },
      description: { value: 'Test Description' },
      status: { value: 'pending' },
    }

    const mockFetch = vi.fn().mockImplementation(() => {
      // Return list of tasks
      return Promise.resolve({
        json: () => Promise.resolve({
          results: { bindings: [mockTask] },
          success: true
        })
      })
    })
    global.fetch = mockFetch

    render(<PomodoroTimer showCloseButton={false} />)

    // Wait for task dropdown to populate
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    // Select the task
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'http://cientopolis.org/rfu/task/1' } })

    // Click Iniciar
    const startButton = screen.getByText('Iniciar')
    fireEvent.click(startButton)

    // Check that warning does NOT appear
    expect(screen.queryByText(/Debes seleccionar una tarea activa/i)).not.toBeInTheDocument()
  })
})
