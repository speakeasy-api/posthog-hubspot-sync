const POSTHOG_API_URL = 'https://app.posthog.com';
const POSTHOG_API_KEY = '';
const HUBSPOT_API_URL = 'https://api.hubapi.com/crm/v3';

let lastProcessedTimestamp = null;
const processedEventIds = new Set();

const hubspotPropsMap = {
    companyName: 'company',
    company_name: 'company',
    company: 'company',
    lastName: 'lastname',
    last_name: 'lastname',
    lastname: 'lastname',
    firstName: 'firstname',
    first_name: 'firstname',
    firstname: 'firstname',
    phone_number: 'phone',
    phoneNumber: 'phone',
    phone: 'phone',
    website: 'website',
    domain: 'website',
    company_website: 'website',
    companyWebsite: 'website'
}


const config = {
    hubspotAccessToken: "",
    additionalPropertyMappings: "created_at:last_login_date",
    triggeringEvents: {
        $identify: {
            additionalPropertyMappings: "created_at:last_login_date",
            overwrites: {
                hubspotKey: "testfield11",
                value: "TestValue1234",
            }

        },
        authorize_webapp_user: {
            overwrites: {
                hubspotKey: "sign_up_stage",
                value: "Authenticated",
                onlyUpdateIf: (contact, event = {}) =>  ( !contact.properties.sign_up_stage ),
                setOnce: true
            }
        },
        create_workspace: {
            overwrites: {
                hubspotKey: "sign_up_stage",
                value: "Created Workspace",
                onlyUpdateIf: (contact, event = {}) =>  ( contact.properties.sign_up_stage === "Authenticated"), 
                setOnce: true
            }
        },
        validate_spec: {
            overwrites: {
                hubspotKey: "sign_up_stage",
                value: "Validated Spec",
                onlyUpdateIf: (contact, event = {}) =>  ( contact.properties.sign_up_stage === "Created Workspace"),
                setOnce: true
            }
        },
        generate_sdk_entry: {
            overwrites: {
                hubspotKey: "sign_up_stage",
                value: "Generated SDK",
                onlyUpdateIf: (contact, event = {}) =>  ( contact.properties.sign_up_stage === "validated Spec"),
                setOnce: true
            }
        },
    }
};

async function setupPlugin(config) {
    try {
        config.hubspotAccessToken = config.hubspotAccessToken

        const authResponse = await fetch(
            `https://api.hubapi.com/crm/v3/objects/contacts?limit=1&paginateAssociations=false&archived=false`,
            {
                headers: {
                    Authorization: `Bearer ${config.hubspotAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        )

        if (!statusOk(authResponse)) {
            throw new Error('Unable to connect to Hubspot. Please make sure your API key is correct.')
        }
    } catch (error) {
        console.log("throw error and retry later")
        // throw new RetryError(error)
    }
    setInterval(fetchAndProcessPosthogEvents, 60 * 1000, config);
}

async function fetchAndProcessPosthogEvents(config) {
    const since = lastProcessedTimestamp ? `&after=${lastProcessedTimestamp}` : '';
    console.log("Last Processed Timestamp: ", lastProcessedTimestamp);
    console.log("Fetch posthog events");

    const response = await fetch(`${POSTHOG_API_URL}/api/event/?${since}`, {
        headers: {
            Authorization: `Bearer ${POSTHOG_API_KEY}`
        }
    });

    if (response.ok) {
        console.log("Events request ok");
        const events = await response.json();
        
        for (const event of events.results) {
            // Check if event has already been processed
            const triggeringEvents = Object.keys(config.triggeringEvents );

            if (!processedEventIds.has(event.id)) {
                if (triggeringEvents.indexOf(event.event) >= 0) {
                    const email = getEmailFromEvent(event)
                    console.log("Event: ", event.timestamp, event.event, email)

                    if (email==="eric@sidibe.de") {
                        try {
                            await onEvent(event, { config });
                            processedEventIds.add(event.id);
                        } catch(error) {
                            console.log("On event failed with", error, "try again later")
                        }
                    }
                }
            }
        }

        // Update the last processed timestamp and periodically clean up processedEventIds
        if (events.next) {
            lastProcessedTimestamp = new Date(events.results[events.results.length - 1].timestamp).toISOString();
            // Clear the set after 5 minutes to avoid it from growing indefinitely
            setTimeout(() => {
                processedEventIds.clear();
            }, 5 * 60 * 1000);
        }
    } else {
        console.error('Failed to fetch events from PostHog', response.statusText);
    }
}


export async function onEvent(event, { config }) {
    const email = getEmailFromEvent(event)
    console.log("Call onEvent")

    if (email) {
        const emailDomainsToIgnore = (config.ignoredEmails || '').split(',')
        if (emailDomainsToIgnore.indexOf(email.split('@')[1]) >= 0) {
            return
        }
        await createHubspotContact(
            email,
            {
                ...(event['$set'] ?? {}),
                ...(event['properties'] ?? {})
            },
            config.hubspotAccessToken,
            config.triggeringEvents[event.event].additionalPropertyMappings,
            config.triggeringEvents[event.event].overwrites,
            event['timestamp']
        )
    }
}

async function createHubspotContact(email, properties, accessToken, additionalPropertyMappings, overwrites={}, eventSendTime) {
    let hubspotFilteredProps = {}
    for (const [key, val] of Object.entries(properties)) {
        if (hubspotPropsMap[key]) {
            hubspotFilteredProps[hubspotPropsMap[key]] = val
        }
    }

    if (additionalPropertyMappings) {
        // Check here if some user properties need an actual user
        console.log(additionalPropertyMappings)
        console.log(overwrites);
        
        for (let mapping of additionalPropertyMappings.split(',')) {
            const [postHogProperty, hubSpotProperty] = mapping.split(':')
            if (postHogProperty && hubSpotProperty) {
                // special case to convert an event's timestamp to the format Hubspot uses them
                if (postHogProperty === 'sent_at' || postHogProperty === 'created_at') {
                    const d = new Date(eventSendTime)
                    d.setUTCHours(0, 0, 0, 0)
                    hubspotFilteredProps[hubSpotProperty] = d.getTime()
                } else if (postHogProperty in properties) {
                    hubspotFilteredProps[hubSpotProperty] = properties[postHogProperty]
                }
            }
        }
    }

    if (overwrites) {
        console.log("Set overwrite: ", overwrites);
        const contact = await fetchHubspotContactByEmail(email, config, [overwrites.hubspotKey])

        if ( overwrites.setOnce) {
            if (overwrites.onlyUpdateIf(contact)) {
                console.log("OnlyUpdateIf true is valid here");
                hubspotFilteredProps[overwrites.hubspotKey] = overwrites.value;
            } 
        } else {
            hubspotFilteredProps[overwrites.hubspotKey] = overwrites.value;
        }
    }


    const addContactResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties: { email: email, ...hubspotFilteredProps } })
    })

    const addContactResponseJson = await addContactResponse.json()

    if (!statusOk(addContactResponse) || addContactResponseJson.status === 'error') {
        const errorMessage = addContactResponseJson.message ?? ''
        console.log(
            `Unable to add contact ${email} to Hubspot. Status Code: ${addContactResponse.status}. Error message: ${errorMessage}`
        )

        if (addContactResponse.status === 409) {
            const existingIdRegex = /Existing ID: ([0-9]+)/
            const existingId = addContactResponseJson.message.match(existingIdRegex)
            console.log(`Attempting to update contact ${email} instead...`)

            const updateContactResponse = await fetch(
                `https://api.hubapi.com/crm/v3/objects/contacts/${existingId[1]}`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ properties: { email: email, ...hubspotFilteredProps } })
                }
            )

            const updateResponseJson = await updateContactResponse.json()
            if (!statusOk(updateContactResponse)) {
                const errorMessage = updateResponseJson.message ?? ''
                console.log(
                    `Unable to update contact ${email} to Hubspot. Status Code: ${updateContactResponse.status}. Error message: ${errorMessage}`
                )
            } else {
                console.log(`Successfully updated Hubspot Contact for ${email}`)
            }
        }
    } else {
        console.log(`Created Hubspot Contact for ${email}`)
    }
}

function statusOk(res) {
    return String(res.status)[0] === '2'
}

function isEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(String(email).toLowerCase())
}

function getEmailFromEvent(event) {
    if (isEmail(event.distinct_id)) {
        return event.distinct_id
    } else if (event['$set'] && Object.keys(event['$set']).includes('email')) {
        if (isEmail(event['$set']['email'])) {
            return event['$set']['email']
        }
    } else if (event['properties'] && Object.keys(event['properties']).includes('email')) {
        if (isEmail(event['properties']['email'])) {
            return event['properties']['email']
        }
    }

    return null
}

async function fetchHubspotContactByEmail(email, config, additionalProperties = ["sign_up_stage"]) {
    const ENDPOINT = "/objects/contacts/search"

    const requestBody = {
        filterGroups: [{
            filters: [{
                value: email,
                propertyName: 'email',
                operator: 'EQ'
            }]
        }],
        properties: [...additionalProperties, 'email', 'firstname', 'lastname', 'company'] // Add other properties as needed
    };

    const response = await fetch(HUBSPOT_API_URL+ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.hubspotAccessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (statusOk(response)) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            return data.results[0];
        } else {
            console.log(`No contact found with the email: ${email}`);
        }
    } else {
        const errorMessage = (await response.json()).message ?? '';
        console.error(`Failed to fetch contact from HubSpot. Status: ${response.status}. Error message: ${errorMessage}`);
    }
}

setupPlugin(config);