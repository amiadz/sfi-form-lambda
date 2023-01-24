const fetch = require('node-fetch')
require('dotenv').config()

const requestHeaders = {
    "authorization": process.env.AUTHORIZATION,
    'Content-Type': 'application/json'
}

const col_id_details_map = JSON.parse(process.env.COL_ID_DETAILS_MAP)
const col_id_map = JSON.parse(process.env.COL_ID_MAP)

const query = `
query getEmployeeDetails($employee_id: String!) {
  items_by_column_values (board_id: ${process.env.BOARD_ID}, column_id: ${col_id_map.id}, column_value: $employee_id) {
        column_values(ids: [${Object.values(col_id_details_map)}]) {
            id
            text
        }
    }
  }
`
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

exports.verify = async (event, context) => {
    try {
        console.log('====================================');
        console.log("event", event);
        console.log('====================================');
        var {
            phone,
            first_name,
            last_name
        } = await getEmployeeDetails(JSON.parse(event.body).userId);

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

async function getEmployeeDetails(userId) {

    const variables = {
        employee_id: userId
    }

    const employee_data_json = (await (await fetch(process.env.MONDAY_URL, {
        method: 'post',
        headers: requestHeaders,
        body: JSON.stringify({
            query,
            variables
        })
    })).json()).data?.items_by_column_values[0];

    employee_data = employee_data_json?.column_values.reduce((map, cur) => {
        map[cur.id] = cur.text;
        return map;
    }, {});
    
    // Add + before the prefix (972)
    var phone = '+' + employee_data[col_id_details_map.phone];
    var first_name = employee_data[col_id_details_map.first_name];
    var last_name = employee_data[col_id_details_map.last_name];
    return { phone, first_name, last_name };
}