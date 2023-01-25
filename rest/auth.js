const fetch = require('node-fetch')
require('dotenv').config()

const requestHeaders = {
    "authorization": process.env.AUTHORIZATION,
    'Content-Type': 'application/json'
}

const COL_ID_DETAILS_MAP = JSON.parse(process.env.COL_ID_DETAILS_MAP)
const COL_ID_MAP = JSON.parse(process.env.COL_ID_MAP)

const query = `
query getEmployeeDetails($employee_id: String!, $columns_ids: [String]!) {
  items_by_column_values (board_id: ${process.env.BOARD_ID}, column_id: ${COL_ID_MAP.id}, column_value: $employee_id) {
        column_values(ids: $columns_ids) {
            id
            text
        }
    }
  }
`
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

exports.login = async (event, context) => {
    try {
        console.log('====================================');
        console.log("event", event);
        console.log('====================================');
        var {
            phone,
            first_name,
            last_name
        } = await getEmployeeMainDetails(JSON.parse(event.body).userId, Object.values(COL_ID_DETAILS_MAP));

        if (phone) {
            const verification = await client.verify.services(process.env.TWILIO_VERIFY_SERVICE)
                .verifications
                .create({
                    to: phone,
                    channel: 'whatsapp'
                });

            if (verification.status !== 'pending') {
                context.failed();
            } else {
                var response = {
                    userName: first_name + ' ' + last_name
                }
                return {
                    statusCode: 200,
                    body: JSON.stringify(response)
                }
            }
        }
    } catch (err) {
        console.log(err);
        return {
            statusCode: 500,
            message: err
        };
    }
};

exports.verify = async (event, context) => {
    try {
        console.log('====================================');
        console.log("event", event);
        console.log('====================================');
        var body = JSON.parse(event.body);
        var code = body.code
        var employeeId = body.userId

        var phone = await getEmployeePhone(employeeId, [COL_ID_DETAILS_MAP["phone"]])

        const verificationCheck = await client.verify.services(process.env.TWILIO_VERIFY_SERVICE)
            .verificationChecks
            .create({
                to: phone,
                code: code
            });

        if (verificationCheck.status !== 'approved') {
            return {
                'statusCode': 401,
                'headers': {
                    'Content-Type': 'text/html'
                },
                'message': "Unauthorized"
            }
        }

        const mondayDataJson = await getEmployeeFormDetails(employeeId, Object.values(COL_ID_MAP));

        return {
            statusCode: 200,
            body: JSON.stringify(mondayDataJson)
        }
    } catch (err) {
        console.log(err);
        return {
            'statusCode': 500,
            'message': err
        }
    }
};

async function getEmployeeMainDetails(employeeId, columnsIds) {
    const employeeDataJson = await getDataFromMonday(employeeId, columnsIds)

    var employeeData = employeeDataJson?.column_values.reduce((map, cur) => {
        map[cur.id] = cur.text;
        return map;
    }, {});
    
    // Add + before the prefix (972)
    var phone = '+' + employeeData[COL_ID_DETAILS_MAP.phone];
    var first_name = employeeData[COL_ID_DETAILS_MAP.first_name];
    var last_name = employeeData[COL_ID_DETAILS_MAP.last_name];
    return { phone, first_name, last_name };
}

async function getEmployeeFormDetails(employeeId, columnsIds) {
    const employeeDataJson = await getDataFromMonday(employeeId, columnsIds)

    var employeeData = employeeDataJson?.column_values.reduce((map, cur) => {
        map[cur.id] = cur.text;
        return map;
    }, {});
    
    var mondayDataJson = {};
    for (const key in COL_ID_MAP) {
        const val = COL_ID_MAP[key];
        mondayDataJson[key] = employeeData[val]
    }

    return mondayDataJson;
}

async function getEmployeePhone(employeeId, columnsIds) {
    const variables = {
        employee_id: employeeId,
        columns_ids: columnsIds
    }

    const employeeDataJson = (await (await fetch(process.env.MONDAY_URL, {
        method: 'post',
        headers: requestHeaders,
        body: JSON.stringify({
            query,
            variables
        })
    })).json()).data?.items_by_column_values[0];

    var employeeData = employeeDataJson?.column_values.reduce((map, cur) => {
        map[cur.id] = cur.text;
        return map;
    }, {});

    return '+' + employeeData[COL_ID_DETAILS_MAP.phone];
}

async function getDataFromMonday(employeeId, columnsIds) {
    const variables = {
        employee_id: employeeId,
        columns_ids: columnsIds
    }

    const employeeDataJson = (await (await fetch(process.env.MONDAY_URL, {
        method: 'post',
        headers: requestHeaders,
        body: JSON.stringify({
            query,
            variables
        })
    })).json()).data?.items_by_column_values[0];

    return employeeDataJson
}
