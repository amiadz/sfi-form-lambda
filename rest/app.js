const fetch = require('node-fetch')
require('dotenv').config()

const col_id_map = JSON.parse(process.env.COL_ID_MAP)

const query = `
query getEmployeeDetails($employee_id: String!) {
  items_by_column_values (board_id: ${process.env.BOARD_ID}, column_id: ${col_id_map.id}, column_value: $employee_id) {
    id
        column_values(ids: ${Object.values(col_id_map)}) {
            id
            title
            text
        }
    }
  }
`

const mutation = `
mutation updateEmployeeDetails($itemId: Int!, $colVal: JSON!) {
  change_multiple_column_values (board_id: 3615818990, item_id: $itemId, column_values: $colVal) {
        id
        name
        column_values {
            id
            title
            text
        }
    }
  }
`

const requestHeaders = {
    "authorization": process.env.AUTHORIZATION,
    'Content-Type': 'application/json'
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

const forms = {
    'welcome': 'welcome_form.html',
    'verify': 'verify_form.handlebars',
    'employee': 'employee_form.handlebars',
}

exports.employeeFormHandler = async (event, context) => {
    try {
        const phone = event.queryStringParameters.phone
        const code = event.queryStringParameters.code
        const employee_id = event.queryStringParameters.employee_id

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

        const variables = {
            employee_id: employee_id
        }

        const mondayDataJson = await getMondayDataJson(variables);

        const renderedHTML = getRenderedHTML(mondayDataJson, forms.employee);

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/html',
                'Set-Cookie': `itemId=${mondayDataJson.itemId}`
            },
            'body': renderedHTML
        }
    } catch (err) {
        console.log(err);
        return {
            'statusCode': 500,
            'message': err
        }
    }
};

exports.submitEmployeeFormHandler = async (event, context) => {
    try {
        const data = JSON.parse(event.body)
        const colValJson = {
            [col_id_map.salary]: data.income
        }

        const variables = {
            colVal: JSON.stringify(colValJson),
            itemId: event.Cookie.itemId
        }

        const mondayData = (await (await fetch('https://api.monday.com/v2', {
            method: 'post',
            headers: requestHeaders,
            body: JSON.stringify({
                mutation,
                variables
            })
        })).json())

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/html',
            },
            'body': 'OK!'
        }
    } catch (err) {
        console.log(err);
        return err;
    }
};

function getRenderedHTML(mondayDataJson, handlebarsName) {
    const formTemplate = fs.readFileSync(path.join('.', 'templates', handlebarsName), 'utf8');
    const template = Handlebars.compile(formTemplate);

    const renderedHTML = template(mondayDataJson);
    return renderedHTML;
}

async function getMondayDataJson(variables) {
    const mondayData = (await (await fetch(process.env.MONDAY_URL, {
        method: 'post',
        headers: requestHeaders,
        body: JSON.stringify({
            query,
            variables
        })
    })).json()).data;

    const mondayNecData = mondayData.items_by_column_values[0].column_values.reduce((map, cur) => {
        map[cur.id] = cur.text;
        return map;
    }, {})

    var mondayDataJson = {};
    for (const key in col_id_map) {
        const val = col_id_map[key];
        mondayDataJson[key] = mondayNecData[val]
    }
    mondayDataJson['itemId'] = mondayData.items_by_column_values[0].id
    
    return mondayDataJson;
}