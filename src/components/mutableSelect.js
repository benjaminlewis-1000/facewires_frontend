import React from 'react';
import { Dropdown} from 'semantic-ui-react';

class MutableSelect extends React.Component{
  constructor(props){
    super(props);

    this.state = {
      loaded: false,
    }
    
  }   


  makeChange(){
    if (this.state.loaded){
      return(
          // <form>
          // <input type='text' value="Clicked" onClick={()=>this.setState({loaded: true}) }/>
          // </form>

        <Dropdown
          className='person_select'
          placeholder='Select Person'
          search
          selection
          options={this.props.peopleOptions}
          searchInput={{ autoFocus: true }}
        />
      )
    }else{

      return (

          <form>
          <input type='text' className='ui active visible search selection dropdown person_select' onClick={()=>this.setState({loaded: true}) }/>
          </form>
      )
    }
  }


  render(){
    return(
      <span className='person_select'>
      {this.makeChange()}
      </span>
    )
  }

}

export default MutableSelect