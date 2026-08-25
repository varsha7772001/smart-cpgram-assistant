# Smart CPGRAM Assistant

> **A simpler AI-assisted grievance journey: describe the problem in your own words, get routing help, detect possible repeat grievances, prepare a clear complaint, submit it in the prototype, and track its simulated lifecycle.**

**Build What Moves India — Track 1: AI for Digital Public Infrastructure & Governance**

🌐 **Live Prototype:** https://smart-cpgram-assistant.vercel.app

> **Independent hackathon prototype. Not affiliated with CPGRAMS or the Government of India. No grievance is transmitted to any Government of India system.**

---

## The Problem

Citizens usually know **what happened**, but grievance systems often require them to also understand:

- which department should receive the complaint,
- which category or subcategory is appropriate,
- what information should be included,
- how to write the grievance clearly,
- whether a similar grievance has already been raised,
- and what happens after submission.

This shifts the burden of understanding administrative structure onto the citizen before they can even explain their problem.

### The question behind this prototype

> **What if citizens only had to explain what happened, and the system helped with the structure?**

---

## The Solution

Smart CPGRAM Assistant starts with the citizen's own words.

The prototype helps the citizen:

1. Check whether the issue is relevant to a government/public service.
2. Describe the grievance naturally.
3. Provide only the missing information that is actually needed.
4. Identify a suitable department and controlled category.
5. Check the citizen's own history for a **possible existing grievance**.
6. Convert informal text into a concise, professional grievance.
7. Review and edit everything before submission.
8. Save a Draft or complete a **simulated prototype submission**.
9. Receive a prototype reference.
10. Track the simulated lifecycle from **Pending → Under Review → Resolved → Closed**.

Government submission and processing are intentionally simulated.

---

## How the Citizen Journey Changes

| Traditional approach | Smart CPGRAM Assistant |
| --- | --- |
| Citizen must understand **Department → Category → Form → Description** | Citizen begins with **“Tell us what happened.”** |
| Administrative taxonomy comes first | The citizen's story comes first |
| Unclear complaints may be poorly routed | AI asks minimal clarification before routing |
| Repeat grievances may be difficult to notice | The citizen's own history is checked |
| Similarity may be treated too aggressively | The system says **Possible existing grievance** and leaves the decision to the citizen |
| Submission is the end of the visible journey | The prototype demonstrates acknowledgement and lifecycle tracking |

---

## End-to-End User Journey

```mermaid
flowchart TD
    A[Login / Sign Up / Try Demo] --> B[Describe the problem]

    B --> C{Government / public-service issue?}

    C -->|Unclear| D[Ask one targeted clarification]
    D --> C

    C -->|Not relevant| E[Explain scope and allow editing]

    C -->|Relevant| F{More grievance details needed?}

    F -->|Yes| G[Ask minimal clarification]
    F -->|No| H[Suggest Department & Category]
    G --> H

    H --> I[Check citizen's previous grievances]

    I --> J{Possible existing grievance?}

    J -->|Yes| K[Citizen reviews possible match]
    K --> L{Same issue?}
    L -->|Different| M[This Is a Different Issue]
    L -->|Same| N[View existing grievance]

    J -->|No| O[Prepare grievance]
    M --> O

    O --> P[Final Review]

    P --> Q{Citizen action}

    Q -->|Save| R[Draft]
    Q -->|Submit| S[Prototype Submission]
    R -->|Submit later| S

    S --> T[Prototype Acknowledgement]
    T --> U[Pending]
    U --> V[Under Review]
    V --> W[Resolved]
    W --> X[Closed]