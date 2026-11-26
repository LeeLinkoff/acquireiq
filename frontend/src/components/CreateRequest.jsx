/*
 * CreateRequest provides the form used to create a new acquisition request.
 * It collects the fields required by the POST /requests API and delegates
 * validation of business rules to the backend.
 */

import React, { useState } from 'react'
import { createRequest } from '../api/client.js'
import Message from './Message.jsx'
import '../styles/create-request.css'


export default function CreateRequest()
{
  const currentYear = new Date().getFullYear()

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    requestorId: '',
    priority: '',
    budgetCeiling: '',
    fiscalYear: String(currentYear),
  })

  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)

  const handleChange = (event) =>
  {
    const { name, value } = event.target

    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleSubmit = async (event) =>
  {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)

    try
    {
      const createdRequest = await createRequest({
        title: formData.title,
        description: formData.description,
        requestorId: Number(formData.requestorId),
        priority: formData.priority,
        budgetCeiling: formData.budgetCeiling,
        fiscalYear: Number(formData.fiscalYear),
      })

      setMessage({
        type: 'success',
        title: 'Request Created',
        message: `Acquisition request ${createdRequest.id} was created successfully.`,
      })

      setFormData({
        title: '',
        description: '',
        requestorId: '',
        priority: '',
        budgetCeiling: '',
        fiscalYear: String(currentYear),
      })
    }
    catch (error)
    {
      setMessage({
        type: 'error',
        title: 'Unable to Create Request',
        message: error?.details?.error ?? error.message,
      })
    }
    finally
    {
      setSubmitting(false)
    }
  }

  return (
    <section className="create-request">
      <div className="app-eyebrow">CREATE REQUEST</div>
      <h3>New Acquisition Request</h3>

      <form className="create-request-form" onSubmit={handleSubmit}>
        <label>
          Title
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Description
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Requestor ID
          <input
            type="number"
            min="1"
            step="1"
            name="requestorId"
            value={formData.requestorId}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Priority
          <select
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            required
          >
            <option value="">Select priority...</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <label>
          Budget Ceiling
          <input
            type="number"
            min="0"
            step="0.01"
            name="budgetCeiling"
            value={formData.budgetCeiling}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Fiscal Year
          <select
            name="fiscalYear"
            value={formData.fiscalYear}
            onChange={handleChange}
            required
          >
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear + 1}>{currentYear + 1}</option>
            <option value={currentYear + 2}>{currentYear + 2}</option>
          </select>
        </label>

        <div className="create-request-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create Request'}
          </button>
        </div>
      </form>

      {message && (
        <Message
          type={message.type}
          title={message.title}
          message={message.message}
          onClose={() => setMessage(null)}
        />
      )}
    </section>
  )
}